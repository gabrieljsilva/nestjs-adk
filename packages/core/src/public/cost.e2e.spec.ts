import { afterEach, describe, expect, it } from "vitest";
import { InMemoryArtifactStorage } from "../adapters/storage/in-memory-artifact-storage";
import { InMemorySessionStorage } from "../adapters/storage/in-memory-session-storage";
import { PricingNoticeSink } from "../contracts/pricing-notice-sink";
import { PricingSource } from "../contracts/pricing-source";
import { AgentDefinition } from "../domain/agent/agent-definition";
import { AgentDelegationPolicy } from "../domain/agent/agent-delegation-policy";
import { AgentDescription } from "../domain/agent/agent-description";
import { AgentExecutionPolicies } from "../domain/agent/agent-execution-policies";
import { AgentName } from "../domain/agent/agent-name";
import { DeclaredAgent } from "../domain/agent/declared-agent";
import { SequentialFailoverPolicy } from "../domain/agent/sequential-failover-policy";
import { ModelPrice } from "../domain/cost/model-price";
import type { ModelUnpriced } from "../domain/cost/model-unpriced";
import { TokenRate } from "../domain/cost/token-rate";
import { ModelCallFailedError } from "../domain/model/errors/model-call-failed.error";
import { LlmModel } from "../domain/model/llm-model";
import { ModelCapabilities } from "../domain/model/model-capabilities";
import { ModelCapability } from "../domain/model/model-capability";
import { ModelChunk } from "../domain/model/model-chunk";
import { ModelContextWindow } from "../domain/model/model-context-window";
import { ModelDescriptor } from "../domain/model/model-descriptor";
import { ModelIdentity } from "../domain/model/model-identity";
import type { ModelRequest } from "../domain/model/model-request";
import { ModelUsage } from "../domain/model/model-usage";
import { ToolCallDelta } from "../domain/model/tool-call-delta";
import { ToolResultMessage } from "../domain/model/tool-result-message";
import { UnavailableFailure } from "../domain/model/unavailable-failure";
import { PromptInstructions } from "../domain/prompt/prompt-instructions";
import { AskInput } from "../domain/session/ask-input";
import { RuntimeOptions } from "../runtime/composition/runtime-options";
import { AgentRunCommand } from "../runtime/run/agent-run-command";
import { FakeClock } from "../support/fake-clock";
import { SequenceIdGenerator } from "../support/sequence-id-generator";
import { AdkRuntimeHost } from "./adk-runtime-host";

const SUPPORT = AgentName.from("support");
const RESEARCHER = AgentName.from("researcher");

const PRIMARY = ModelIdentity.of("acme", "primary");
const FALLBACK = ModelIdentity.of("acme", "fallback");
const CHILD = ModelIdentity.of("acme", "child");

const RATES = new Map([
	[PRIMARY.toString(), ModelPrice.of(TokenRate.fromUsdPerToken(1e-7), TokenRate.fromUsdPerToken(4e-7))],
	[FALLBACK.toString(), ModelPrice.of(TokenRate.fromUsdPerToken(1e-8), TokenRate.fromUsdPerToken(4e-8))],
	[CHILD.toString(), ModelPrice.of(TokenRate.fromUsdPerToken(2e-7), TokenRate.fromUsdPerToken(8e-7))],
]);

/** Prices only what it was told about, so a test can leave one model out on purpose. */
class KnownRates extends PricingSource {
	public readonly asked: string[] = [];

	public constructor(private readonly known: readonly ModelIdentity[] = [...RATES.keys()].map(identityOf)) {
		super();
	}

	public async priceOf(model: ModelIdentity): Promise<ModelPrice | undefined> {
		this.asked.push(model.toString());
		return this.known.some((known) => known.equals(model)) ? RATES.get(model.toString()) : undefined;
	}
}

class CollectedNotices extends PricingNoticeSink {
	public readonly reported: ModelUnpriced[] = [];

	public report(notice: ModelUnpriced): void {
		this.reported.push(notice);
	}
}

function identityOf(key: string): ModelIdentity {
	const [provider, ...rest] = key.split("/");
	return ModelIdentity.of(provider ?? "", rest.join("/"));
}

class AnsweringModel extends LlmModel {
	public turns = 0;

	public constructor(
		private readonly identity: ModelIdentity,
		private readonly usage: ModelUsage = ModelUsage.of(40, 12),
	) {
		super();
	}

	public descriptor(): ModelDescriptor {
		return new ModelDescriptor(this.identity, ModelContextWindow.of(100_000, 4000), ModelCapabilities.none());
	}

	public async *generate(): AsyncIterable<ModelChunk> {
		this.turns += 1;
		yield ModelChunk.text("done");
		yield ModelChunk.usage(this.usage);
		yield ModelChunk.finish("stop");
	}
}

/** Always down, so the failover policy is what answers and the bill belongs to the fallback. */
class DownModel extends LlmModel {
	public descriptor(): ModelDescriptor {
		return new ModelDescriptor(PRIMARY, ModelContextWindow.of(100_000, 4000), ModelCapabilities.none());
	}

	public async *generate(): AsyncIterable<ModelChunk> {
		// Rejected before the first chunk, which is the only point a reroute is still allowed.
		yield await Promise.reject(new ModelCallFailedError(new UnavailableFailure("acme is down"), PRIMARY.toString()));
	}
}

/** Answers nothing about usage at all, the way a provider that reports no tokens does. */
class SilentAboutUsageModel extends LlmModel {
	public descriptor(): ModelDescriptor {
		return new ModelDescriptor(PRIMARY, ModelContextWindow.of(100_000, 4000), ModelCapabilities.none());
	}

	public async *generate(): AsyncIterable<ModelChunk> {
		yield ModelChunk.text("done");
		yield ModelChunk.finish("stop");
	}
}

/** Asks a specialist one thing, then answers with what came back. */
class DelegatingModel extends LlmModel {
	public descriptor(): ModelDescriptor {
		return new ModelDescriptor(
			PRIMARY,
			ModelContextWindow.of(100_000, 4000),
			ModelCapabilities.of([[ModelCapability.TOOLS, true]]),
		);
	}

	public async *generate(request: ModelRequest): AsyncIterable<ModelChunk> {
		if (request.messages.some((message) => message instanceof ToolResultMessage)) {
			yield ModelChunk.text("the specialist answered");
			yield ModelChunk.usage(ModelUsage.of(40, 12));
			yield ModelChunk.finish("stop");
			return;
		}
		yield ModelChunk.toolCall(
			new ToolCallDelta(
				0,
				JSON.stringify({ agentName: RESEARCHER.value, task: "look it up" }),
				"d-1",
				"delegate_to_agent",
			),
		);
		yield ModelChunk.usage(ModelUsage.of(40, 12));
		yield ModelChunk.finish("tool_calls");
	}
}

const delegatesToResearcher = () => AgentExecutionPolicies.of().withDelegation(AgentDelegationPolicy.to([RESEARCHER]));

function declaredAgent(
	name: AgentName,
	model: LlmModel,
	policies: AgentExecutionPolicies = AgentExecutionPolicies.of(),
): DeclaredAgent {
	return new DeclaredAgent(
		AgentDefinition.of(
			name,
			AgentDescription.from(`${name.value} agent`, name.value),
			model,
			PromptInstructions.from("Be brief."),
			policies,
		),
		`${name.value}Agent`,
	);
}

const host = new AdkRuntimeHost();

afterEach(async () => {
	await host.stop();
});

const start = (declared: readonly DeclaredAgent[], options: RuntimeOptions) =>
	host.start(
		declared,
		new InMemorySessionStorage(),
		new InMemoryArtifactStorage(new SequenceIdGenerator("a")),
		new FakeClock(),
		new SequenceIdGenerator(),
		options,
	);

describe("what a run costs", () => {
	it("prices the turns of one run and names the model that served them", async () => {
		const runtime = await start(
			[declaredAgent(SUPPORT, new AnsweringModel(PRIMARY))],
			RuntimeOptions.from({ pricing: new KnownRates() }),
		);

		const result = await runtime.runner.ask(new AgentRunCommand(SUPPORT, AskInput.of("hi")));

		expect(result.cost.total.toString()).toBe("0.0000088");
		expect(result.cost.byModel).toHaveLength(1);
		expect(result.cost.byModel[0]?.model.toString()).toBe(PRIMARY.toString());
		expect(result.cost.calls).toBe(1);
		expect(result.cost.isComplete).toBe(true);
	});

	/** AC-07: the bill belongs to whoever answered, which after a reroute is the other model. */
	it("bills a rerouted turn to the model that actually answered", async () => {
		const fallback = new AnsweringModel(FALLBACK);
		const runtime = await start(
			[declaredAgent(SUPPORT, new DownModel(), AgentExecutionPolicies.of(new SequentialFailoverPolicy([fallback])))],
			RuntimeOptions.from({ pricing: new KnownRates() }),
		);

		const result = await runtime.runner.ask(new AgentRunCommand(SUPPORT, AskInput.of("hi")));

		expect(result.cost.byModel.map((cost) => cost.model.toString())).toEqual([FALLBACK.toString()]);
		expect(result.cost.total.toString()).toBe("0.00000088");
		expect(fallback.turns).toBe(1);
	});

	/** AC-08: what a child spent is the parent's bill, once, and readable apart from the parent's. */
	it("adds a delegation's cost to the parent and keeps the two models apart", async () => {
		const runtime = await start(
			[
				declaredAgent(SUPPORT, new DelegatingModel(), delegatesToResearcher()),
				declaredAgent(RESEARCHER, new AnsweringModel(CHILD, ModelUsage.of(30, 3))),
			],
			RuntimeOptions.from({ pricing: new KnownRates() }),
		);

		const result = await runtime.runner.ask(new AgentRunCommand(SUPPORT, AskInput.of("look it up")));

		const byModel = new Map(result.cost.byModel.map((cost) => [cost.model.toString(), cost]));
		expect([...byModel.keys()].sort()).toEqual([CHILD.toString(), PRIMARY.toString()].sort());
		expect(byModel.get(PRIMARY.toString())?.calls).toBe(2);
		expect(byModel.get(CHILD.toString())?.calls).toBe(1);
		// Two parent turns at 8.8 microdollars each, plus a child turn of 30 in and 3 out.
		expect(result.cost.total.toString()).toBe("0.000026");
		expect(result.cost.calls).toBe(3);
	});

	/** AC-06: a runtime with no source declared still answers, and the zero is marked as unpriced. */
	it("answers a zero cost with a warning when nothing was declared", async () => {
		const notices = new CollectedNotices();
		const runtime = await start(
			[declaredAgent(SUPPORT, new AnsweringModel(PRIMARY))],
			RuntimeOptions.from({ pricingNotices: notices }),
		);

		const result = await runtime.runner.ask(new AgentRunCommand(SUPPORT, AskInput.of("hi")));

		expect(result.text).toBe("done");
		expect(result.cost.total.isZero).toBe(true);
		expect(result.cost.isComplete).toBe(false);
		expect(notices.reported.map((notice) => notice.reason)).toEqual(["no-source"]);
	});

	/** AC-04: a model the source does not know costs nothing and is named, rather than read as free. */
	it("leaves a model the source does not know out of the total and reports it", async () => {
		const notices = new CollectedNotices();
		const runtime = await start(
			[declaredAgent(SUPPORT, new AnsweringModel(PRIMARY))],
			RuntimeOptions.from({ pricing: new KnownRates([CHILD]), pricingNotices: notices }),
		);

		const result = await runtime.runner.ask(new AgentRunCommand(SUPPORT, AskInput.of("hi")));

		expect(result.cost.total.isZero).toBe(true);
		expect(result.cost.unpriced.map((model) => model.toString())).toEqual([PRIMARY.toString()]);
		expect(notices.reported[0]?.reason).toBe("unknown-model");
		expect(notices.reported[0]?.tokens).toBe(52);
	});

	it("reports a provider that said nothing about usage instead of pricing it as free", async () => {
		const notices = new CollectedNotices();
		const runtime = await start(
			[declaredAgent(SUPPORT, new SilentAboutUsageModel())],
			RuntimeOptions.from({ pricing: new KnownRates(), pricingNotices: notices }),
		);

		const result = await runtime.runner.ask(new AgentRunCommand(SUPPORT, AskInput.of("hi")));

		expect(result.cost.isComplete).toBe(false);
		expect(notices.reported[0]?.reason).toBe("no-usage");
	});

	it("asks the source once for a run of several turns on one model", async () => {
		const source = new KnownRates();
		const runtime = await start(
			[
				declaredAgent(SUPPORT, new DelegatingModel(), delegatesToResearcher()),
				declaredAgent(RESEARCHER, new AnsweringModel(CHILD, ModelUsage.of(30, 3))),
			],
			RuntimeOptions.from({ pricing: source }),
		);

		await runtime.runner.ask(new AgentRunCommand(SUPPORT, AskInput.of("look it up")));

		expect(source.asked.sort()).toEqual([CHILD.toString(), PRIMARY.toString()].sort());
	});

	/** Two runtimes, two sources: one application's rates are never the other's. */
	it("keeps two runtimes with different sources apart", async () => {
		const cheap = new AdkRuntimeHost();
		const expensive = new AdkRuntimeHost();
		const startOn = (source: PricingSource, host: AdkRuntimeHost) =>
			host.start(
				[declaredAgent(SUPPORT, new AnsweringModel(PRIMARY))],
				new InMemorySessionStorage(),
				new InMemoryArtifactStorage(new SequenceIdGenerator("a")),
				new FakeClock(),
				new SequenceIdGenerator(),
				RuntimeOptions.from({ pricing: source }),
			);

		try {
			const first = await startOn(new KnownRates([PRIMARY]), cheap);
			const second = await startOn(new KnownRates([CHILD]), expensive);

			const priced = await first.runner.ask(new AgentRunCommand(SUPPORT, AskInput.of("hi")));
			const unpriced = await second.runner.ask(new AgentRunCommand(SUPPORT, AskInput.of("hi")));

			expect(priced.cost.isComplete).toBe(true);
			expect(unpriced.cost.isComplete).toBe(false);
		} finally {
			await cheap.stop();
			await expensive.stop();
		}
	});

	/** AC-09: streaming changes how a turn arrives, not what it used or what it cost. */
	it("costs the same whether the turn was streamed or waited for", async () => {
		const runtime = await start(
			[declaredAgent(SUPPORT, new AnsweringModel(PRIMARY))],
			RuntimeOptions.from({ pricing: new KnownRates() }),
		);

		const waited = await runtime.runner.ask(new AgentRunCommand(SUPPORT, AskInput.of("hi")));
		const streaming = runtime.runner.stream(new AgentRunCommand(SUPPORT, AskInput.of("hi")));
		let streamed = await streaming.next();
		while (streamed.done !== true) streamed = await streaming.next();

		expect(streamed.value.cost.total.equals(waited.cost.total)).toBe(true);
		expect(streamed.value.cost.calls).toBe(waited.cost.calls);
	});

	/** A controller that answers with the result serializes all of it, bigint included. */
	it("comes back as something an HTTP response can carry", async () => {
		const runtime = await start(
			[declaredAgent(SUPPORT, new AnsweringModel(PRIMARY))],
			RuntimeOptions.from({ pricing: new KnownRates() }),
		);

		const result = await runtime.runner.ask(new AgentRunCommand(SUPPORT, AskInput.of("hi")));

		expect(JSON.parse(JSON.stringify(result)).cost.total).toBe("0.0000088");
	});

	/** AC-11: a total past the float's safe integer stays exact, which is why the unit is a bigint. */
	it("stays exact past the largest total a float could hold", async () => {
		const runtime = await start(
			[declaredAgent(SUPPORT, new AnsweringModel(PRIMARY, ModelUsage.of(100_000_000_000, 0)))],
			RuntimeOptions.from({ pricing: new KnownRates() }),
		);

		const result = await runtime.runner.ask(new AgentRunCommand(SUPPORT, AskInput.of("hi")));

		expect(result.cost.total.toString()).toBe("10000");
		expect(result.cost.total.pico).toBe(10_000_000_000_000_000n);
	});
});
