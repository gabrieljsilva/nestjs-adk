import {
	AdkAgent,
	AdkModel,
	AdkModule,
	Agent,
	AgentRegistry,
	AgentSessions,
	LiteLLMPricingSource,
	type ModelPrice,
	type ModelRequest,
	type ModelResponse,
	ModelRouter,
	PricingSource,
	contextPolicy,
} from "@nestjs-adk/core";
import { Module } from "@nestjs/common";
import { Test, type TestingModule } from "@nestjs/testing";
import { GoogleAdkEngine } from "./google-adk-engine";

const PRICES: Record<string, ModelPrice> = {
	"billing-custom": { input: 1e-6, output: 1e-5 },
	"fallback-model": { input: 2e-6, output: 2e-5 },
	"summarizer-model": { input: 5e-7, output: 5e-6 },
	"root-model": { input: 3e-6, output: 3e-5 },
	"sub-model": { input: 4e-6, output: 4e-5 },
};

class FakePricingSource extends PricingSource {
	public priceFor(model: string): ModelPrice | undefined {
		return PRICES[model];
	}

	public asOf(): string | undefined {
		return "2026-07-25T00:00:00.000Z";
	}
}

/** Answers once, reporting the usage the engine has to attribute to this model id. */
class StubModel extends AdkModel {
	public constructor(
		public readonly model: string,
		private readonly reply: string,
		private readonly usage = { promptTokens: 1_000, outputTokens: 100, totalTokens: 1_100 },
	) {
		super();
	}

	public async *generate(_request: ModelRequest): AsyncIterable<ModelResponse> {
		yield { parts: [{ text: this.reply }], usage: this.usage };
	}
}

/** Fails before the first chunk, which is what makes the router advance. */
class FailingModel extends AdkModel {
	public readonly model = "primary-model";

	public generate(): AsyncIterable<ModelResponse> {
		throw new Error("429 resource exhausted");
	}
}

const summarizerModel = new StubModel("summarizer-model", "SUMMARY-OF-OLD-CONVERSATION", {
	promptTokens: 4_000,
	outputTokens: 50,
	totalTokens: 4_050,
});

@Agent({ name: "billing_agent", description: "Billing.", model: new StubModel("billing-custom", "priced answer") })
class BillingAgent extends AdkAgent {}

@Agent({ name: "unknown_model_agent", description: "Unknown.", model: new StubModel("proxy-interno", "answer") })
class UnknownModelAgent extends AdkAgent {}

@Agent({
	name: "routed_agent",
	description: "Routed.",
	model: new ModelRouter({
		targets: { primary: new FailingModel(), fallback: new StubModel("fallback-model", "fallback answer") },
	}),
})
class RoutedAgent extends AdkAgent {}

@Agent({
	name: "long_chat_agent",
	description: "Long chat.",
	model: new StubModel("billing-custom", "continuing the conversation"),
	context: contextPolicy({ compaction: { maxTokens: 50, keepRecent: 2, summarizer: summarizerModel } }),
})
class LongChatAgent extends AdkAgent {}

/** Hands the conversation over on the first turn; the sub-agent answers on its own model. */
class TransferringModel extends AdkModel {
	public readonly model = "root-model";

	public async *generate(request: ModelRequest): AsyncIterable<ModelResponse> {
		const handedOver = request.messages.some((message) => message.parts.some((part) => "toolResult" in part));
		if (handedOver) {
			yield { parts: [{ text: "root done" }], usage: { promptTokens: 10, outputTokens: 1, totalTokens: 11 } };
			return;
		}
		yield {
			parts: [{ toolCall: { name: "transfer_to_agent", args: { agentName: "support_sub" } } }],
			usage: { promptTokens: 500, outputTokens: 50, totalTokens: 550 },
		};
	}
}

@Agent({ name: "support_sub", description: "Support.", model: new StubModel("sub-model", "sub answer") })
class SupportSubAgent extends AdkAgent {}

@Agent({ name: "root_agent", description: "Root.", model: new TransferringModel(), subAgents: [SupportSubAgent] })
class RootAgent extends AdkAgent {}

@Module({ providers: [BillingAgent, UnknownModelAgent, RoutedAgent, LongChatAgent, RootAgent, SupportSubAgent] })
class FeatureModule {}

async function bootstrap(pricing: PricingSource): Promise<TestingModule> {
	const app = await Test.createTestingModule({
		imports: [AdkModule.forRoot({ engine: GoogleAdkEngine, defaultModel: "gemini-2.5-flash", pricing }), FeatureModule],
	}).compile();
	await app.init();
	return app;
}

describe("pricing e2e — cost through the real engine", () => {
	let app: TestingModule;

	afterEach(async () => {
		await app?.close();
		PricingSource.setActive(undefined);
		vi.unstubAllGlobals();
	});

	it("bills the run under the model that actually answered", async () => {
		app = await bootstrap(new FakePricingSource());

		const run = await app.get(AgentRegistry).getRef(BillingAgent).ask({ message: "hello" });

		expect(run.text).toBe("priced answer");
		expect(run.cost).toMatchObject({
			currency: "USD",
			byModel: [{ model: "billing-custom", calls: 1, amount: 1_000 * 1e-6 + 100 * 1e-5 }],
			unpriced: [],
		});
	});

	it("a model outside the catalog is named, not counted as free", async () => {
		app = await bootstrap(new FakePricingSource());

		const run = await app.get(AgentRegistry).getRef(UnknownModelAgent).ask({ message: "hello" });

		expect(run.usage.promptTokens).toBe(1_000);
		expect(run.cost).toMatchObject({ total: 0, byModel: [], unpriced: ["proxy-interno"] });
	});

	it("failover bills the target that served, not the one declared first", async () => {
		app = await bootstrap(new FakePricingSource());

		const run = await app.get(AgentRegistry).getRef(RoutedAgent).ask({ message: "hello" });

		expect(run.text).toBe("fallback answer");
		expect(run.events.find((event) => event.type === "model_rerouted")).toMatchObject({
			from: "primary",
			to: "fallback",
		});
		expect(run.cost?.byModel).toEqual([
			expect.objectContaining({ model: "fallback-model", amount: 1_000 * 2e-6 + 100 * 2e-5 }),
		]);
	});

	it("the compaction summary is a real call: it shows up as its own model, in usage and in cost", async () => {
		app = await bootstrap(new FakePricingSource());
		const sessions = app.get(AgentSessions);
		await sessions.create({ id: "long-1", userId: "u1" });
		for (let index = 0; index < 12; index++) {
			await sessions.append("long-1", {
				type: "message",
				author: index % 2 === 0 ? "user" : "agent",
				data: { text: `historical message number ${index} with plenty of repeated content to bust the token limit` },
			});
		}

		const run = await app.get(AgentRegistry).getRef(LongChatAgent).ask({ sessionId: "long-1", message: "hey?" });

		const summarizerCall = run.events.find(
			(event) => event.type === "llm_response" && event.model === "summarizer-model",
		);
		expect(summarizerCall).toBeDefined();
		expect(run.usage.promptTokens).toBe(1_000 + 4_000);
		expect(run.cost?.byModel).toEqual(
			expect.arrayContaining([
				expect.objectContaining({ model: "summarizer-model", amount: 4_000 * 5e-7 + 50 * 5e-6 }),
				expect.objectContaining({ model: "billing-custom" }),
			]),
		);
	});

	it("after a transfer the sub-agent is billed under its own model, not the root's", async () => {
		app = await bootstrap(new FakePricingSource());

		const run = await app.get(AgentRegistry).getRef(RootAgent).ask({ message: "hello" });

		expect(run.text).toBe("sub answer");
		expect(run.events.find((event) => event.type === "agent_transfer")).toMatchObject({
			from: "root_agent",
			to: "support_sub",
		});
		expect(run.cost?.byModel).toEqual(
			expect.arrayContaining([
				expect.objectContaining({ model: "root-model", amount: 500 * 3e-6 + 50 * 3e-5 }),
				expect.objectContaining({ model: "sub-model", amount: 1_000 * 4e-6 + 100 * 4e-5 }),
			]),
		);
	});

	it("LiteLLMPricingSource wired through forRoot prices a run from the fetched catalog", async () => {
		vi.stubGlobal(
			"fetch",
			vi.fn(async () => ({
				status: 200,
				ok: true,
				json: async () => ({
					"billing-custom": { mode: "chat", input_cost_per_token: 1e-6, output_cost_per_token: 1e-5 },
				}),
				headers: { get: () => null },
			})),
		);
		app = await bootstrap(new LiteLLMPricingSource({ refreshEvery: 60_000 }));

		const run = await app.get(AgentRegistry).getRef(BillingAgent).ask({ message: "hello" });

		expect(run.cost?.total).toBeCloseTo(1_000 * 1e-6 + 100 * 1e-5, 12);
		expect(run.cost?.catalogAsOf).toBeDefined();
	});
});
