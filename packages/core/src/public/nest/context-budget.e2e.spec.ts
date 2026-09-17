import "reflect-metadata";
import { Module } from "@nestjs/common";
import { Test, type TestingModule } from "@nestjs/testing";
import { afterEach, describe, expect, it } from "vitest";
import { InMemorySessionStorage } from "../../adapters/storage/in-memory-session-storage";
import { SessionId } from "../../common/identity/session-id";
import { ContextBudgetExceededError } from "../../domain/context/errors/context-budget-exceeded.error";
import { WindowShareCompactionPolicy } from "../../domain/context/window-share-compaction-policy";
import type { ContextWindow } from "../../domain/model/descriptor/context-window";
import { ModelCapabilities } from "../../domain/model/descriptor/model-capabilities";
import { ModelContextWindow } from "../../domain/model/descriptor/model-context-window";
import { ModelDescriptor } from "../../domain/model/descriptor/model-descriptor";
import { ModelIdentity } from "../../domain/model/descriptor/model-identity";
import { UnknownContextWindow } from "../../domain/model/descriptor/unknown-context-window";
import { LlmModel } from "../../domain/model/llm-model";
import type { ModelRequest } from "../../domain/model/model-request";
import { ModelChunk } from "../../domain/model/streaming/model-chunk";
import { ModelUsage } from "../../domain/model/usage/model-usage";
import { SessionContext } from "../../domain/run/session-context";
import { RuntimeOptions } from "../../runtime/composition/runtime-options";
import { FakeClock } from "../../support/fake-clock";
import { SequenceIdGenerator } from "../../support/sequence-id-generator";
import { AdkAgent } from "./agent/adk-agent";
import { Agent } from "./decorators/agent.decorator";
import { AdkModule } from "./module/adk-module";
import { AdkModuleOptions } from "./module/adk-module-options";

const CHAT = "chat-42";

/**
 * A model that counts a little more on every call, over the window the test chose.
 *
 * The escalation is the point: the runtime re-anchors on the last measurement every turn, so
 * a model reporting the same number forever never approaches its own window no matter how
 * long the conversation gets.
 */
class CountingModel extends LlmModel {
	private calls = 0;

	public constructor(
		private readonly perCall: number,
		private readonly window: ContextWindow = ModelContextWindow.of(1000, 200),
	) {
		super();
	}

	public descriptor(): ModelDescriptor {
		return new ModelDescriptor(ModelIdentity.of("acme", "primary"), this.window, ModelCapabilities.none());
	}

	public async *generate(_request: ModelRequest): AsyncIterable<ModelChunk> {
		yield ModelChunk.text("hello there");
		this.calls += 1;
		yield ModelChunk.usage(ModelUsage.of(this.perCall * this.calls, 5));
		yield ModelChunk.finish("stop");
	}
}

@Agent({ name: "support", description: "Handles orders.", prompt: "Be brief." })
class SupportAgent extends AdkAgent {}

@Agent({ name: "vault", description: "Keeps every word.", prompt: "Be exact.", compaction: false })
class VaultAgent extends AdkAgent {}

/**
 * The context meter, and the compaction the meter does not decide, through a booted module.
 *
 * Both belong here rather than in a unit: the window comes from the agent's own model, and
 * which policy a run ends up under is resolved from declarations that only exist once NestJS
 * has built everything.
 */
describe("how full a conversation's context is", () => {
	let app: TestingModule;
	let storage: InMemorySessionStorage;

	afterEach(async () => {
		await app?.close();
	});

	async function boot(model: LlmModel, runtime?: RuntimeOptions): Promise<TestingModule> {
		storage = new InMemorySessionStorage();

		@Module({ providers: [SupportAgent, VaultAgent] })
		class FeatureModule {}

		app = await Test.createTestingModule({
			imports: [
				AdkModule.forRoot(
					new AdkModuleOptions(model, storage, undefined, new FakeClock(), new SequenceIdGenerator(), runtime),
				),
				FeatureModule,
			],
		}).compile();
		app.enableShutdownHooks();
		await app.init();
		return app;
	}

	async function support(model: LlmModel, runtime?: RuntimeOptions): Promise<SupportAgent> {
		const agent = (await boot(model, runtime)).get(SupportAgent);
		await agent.createSession({ sessionId: CHAT });
		return agent;
	}

	it("answers the window and no size for a conversation nobody has asked anything in", async () => {
		const budget = await (await support(new CountingModel(400))).contextBudget(CHAT);

		expect(budget.window.inputCapacity).toBe(800);
		expect(budget.isMeasured).toBe(false);
		expect(budget.projectedUsedShare).toBeUndefined();
	});

	it("answers how much of the window the last answered question took", async () => {
		const agent = await support(new CountingModel(400));
		await agent.ask("where is my order?", CHAT);

		const budget = await agent.contextBudget(CHAT);

		expect(budget.usedTokens?.tokens).toBe(400);
		expect(budget.projectedUsedShare).toBeCloseTo(0.5, 5);
		expect(budget.projectedFreeTokens).toBe(400);
	});

	it("answers a size and no free room for a model that never declared a window", async () => {
		const agent = await support(new CountingModel(400, new UnknownContextWindow()));
		await agent.ask("where is my order?", CHAT);

		const budget = await agent.contextBudget(CHAT);

		expect(budget.isWindowKnown).toBe(false);
		expect(budget.usedTokens?.tokens).toBe(400);
		expect(budget.projectedFreeTokens).toBeUndefined();
	});

	it("reads nothing about a conversation that was never opened", async () => {
		const agent = (await boot(new CountingModel(400))).get(SupportAgent);

		await expect(agent.contextBudget("nobody")).rejects.toThrow();
	});

	async function converse(agent: SupportAgent | VaultAgent, turns: number): Promise<void> {
		for (let turn = 0; turn < turns; turn += 1) await agent.ask(`question ${turn}`, CHAT);
	}

	/**
	 * The model climbs a tenth of the window per call, so the ninth question is the first one
	 * asked against a conversation that already passed nine tenths. Before this change, an
	 * application that declared nothing about compaction was never compacted at all.
	 */
	it("compacts a conversation past the standard share of the window, with nothing declared", async () => {
		const agent = await support(new CountingModel(80));

		await converse(agent, 12);

		expect((await storage.findCheckpoint(SessionContext.fromSessionId(SessionId.from(CHAT))))?.strategy).toBe(
			"oldest-first",
		);
	});

	/**
	 * Refusing the call is the honest end for an agent that may not lose a word: the alternative
	 * is dropping the beginning of a conversation somebody said to keep whole.
	 */
	it("keeps every word for an agent that turned compaction off, until the window refuses", async () => {
		const vault = (await boot(new CountingModel(80))).get(VaultAgent);
		await vault.createSession({ sessionId: CHAT });

		await expect(converse(vault, 12)).rejects.toBeInstanceOf(ContextBudgetExceededError);
		expect(await storage.findCheckpoint(SessionContext.fromSessionId(SessionId.from(CHAT)))).toBeUndefined();
	});

	/** Half the window is passed on the sixth question, long before nine tenths would be. */
	it("runs under the runtime policy rather than the standard one when one was declared", async () => {
		const runtime = RuntimeOptions.from({
			compaction: new WindowShareCompactionPolicy({ maxShare: 0.5, targetShare: 0.3 }),
		});
		const agent = await support(new CountingModel(80), runtime);

		await converse(agent, 7);

		expect(await storage.findCheckpoint(SessionContext.fromSessionId(SessionId.from(CHAT)))).toBeDefined();
	});
});
