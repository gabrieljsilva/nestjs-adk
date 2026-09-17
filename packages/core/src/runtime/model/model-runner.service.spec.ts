import { describe, expect, it } from "vitest";
import { AgentRunId } from "../../common/identity/agent-run-id.value-object";
import { ToolCallId } from "../../common/identity/tool-call-id.value-object";
import { Duration } from "../../common/time/duration.value-object";
import { AgentFailoverPolicy } from "../../domain/agent/agent-failover.policy";
import { AgentName } from "../../domain/agent/agent-name.value-object";
import { BackoffRetryPolicy } from "../../domain/agent/backoff-retry.policy";
import { ModelsExhaustedError } from "../../domain/agent/errors/models-exhausted.error";
import type { FailoverContext } from "../../domain/agent/failover-context.value-object";
import { NoRetryPolicy } from "../../domain/agent/no-retry.policy";
import { SequentialFailoverPolicy } from "../../domain/agent/sequential-failover.policy";
import { ModelCapabilities } from "../../domain/model/descriptor/model-capabilities.value-object";
import { ModelContextWindow } from "../../domain/model/descriptor/model-context-window.value-object";
import { ModelDescriptor } from "../../domain/model/descriptor/model-descriptor.value-object";
import { ModelIdentity } from "../../domain/model/descriptor/model-identity.value-object";
import { ModelCallFailedError } from "../../domain/model/errors/model-call-failed.error";
import { UnsupportedCapabilityError } from "../../domain/model/errors/unsupported-capability.error";
import { InvalidRequestFailure } from "../../domain/model/failures/invalid-request-failure.value-object";
import type { ModelFailure } from "../../domain/model/failures/model-failure.value-object";
import { RateLimitedFailure } from "../../domain/model/failures/rate-limited-failure.value-object";
import { UnavailableFailure } from "../../domain/model/failures/unavailable-failure.value-object";
import { UnknownFailure } from "../../domain/model/failures/unknown-failure.value-object";
import { LlmModel } from "../../domain/model/llm-model.contract";
import { ToolCallMessage } from "../../domain/model/messages/tool-call-message.value-object";
import { ToolResultMessage } from "../../domain/model/messages/tool-result-message.value-object";
import { UserMessage } from "../../domain/model/messages/user-message.value-object";
import { ModelRequest } from "../../domain/model/model-request.value-object";
import { ModelChunk } from "../../domain/model/streaming/model-chunk.value-object";
import { ModelUsage } from "../../domain/model/usage/model-usage.value-object";
import { FakeClock } from "../../support/fake-clock.double";
import { RunContextFixture } from "../../support/run/run-context.fixture";
import { ModelRunCommand } from "./model-run.command";
import { ModelRunner } from "./model-runner.service";

const RUN = AgentRunId.from("run-1");
const AGENT = AgentName.from("support");
const request = new ModelRequest([new UserMessage("hi")]);

/** Answers a script, or fails in a way an adapter would have classified. */
class ScriptedModel extends LlmModel {
	public calls = 0;
	public readonly requests: ModelRequest[] = [];

	public constructor(
		public readonly name: string,
		private readonly chunks: readonly ModelChunk[] = [ModelChunk.finish("stop")],
		private readonly failure?: ModelFailure,
		private readonly failAfterChunks = 0,
	) {
		super();
	}

	public descriptor(): ModelDescriptor {
		return new ModelDescriptor(
			new ModelIdentity("acme", this.name),
			new ModelContextWindow(1000, 100),
			ModelCapabilities.none(),
		);
	}

	public async *generate(request: ModelRequest): AsyncIterable<ModelChunk> {
		this.calls += 1;
		this.requests.push(request);
		let emitted = 0;
		for (const chunk of this.chunks) {
			if (this.failure !== undefined && emitted === this.failAfterChunks) {
				throw new ModelCallFailedError(this.failure, this.name);
			}
			yield chunk;
			emitted += 1;
		}
		if (this.failure !== undefined) throw new ModelCallFailedError(this.failure, this.name);
	}
}

/** Fails with something no adapter classified, which is a bug rather than a provider saying no. */
class BrokenModel extends LlmModel {
	public calls = 0;

	public descriptor(): ModelDescriptor {
		return new ModelDescriptor(
			new ModelIdentity("acme", "broken"),
			new ModelContextWindow(1000, 100),
			ModelCapabilities.none(),
		);
	}

	public async *generate(): AsyncIterable<ModelChunk> {
		this.calls += 1;
		yield* [];
		throw new TypeError("the adapter has a bug");
	}
}

class RecordingPolicy extends AgentFailoverPolicy {
	public readonly seen: FailoverContext[] = [];

	public constructor(private readonly queue: readonly LlmModel[]) {
		super();
	}

	public async next(_failure: ModelFailure, context: FailoverContext): Promise<LlmModel | undefined> {
		this.seen.push(context);
		return this.queue[context.attempts - 1];
	}
}

function buildCommand(model: LlmModel, failover?: AgentFailoverPolicy): ModelRunCommand {
	return new ModelRunCommand({
		context: CONTEXT,
		runId: RUN,
		agent: AGENT,
		model: model,
		request: request,
		failover: failover,
	});
}

async function collect(runner: ModelRunner, command: ModelRunCommand): Promise<string[]> {
	const texts: string[] = [];
	const turn = runner.stream(command);
	let step = await turn.next();
	while (step.done !== true) {
		texts.push(step.value.textDelta);
		step = await turn.next();
	}
	return texts;
}

/**
 * Retries are off for the failover suite below, so each spec reads the chain rather than
 * the three attempts a default policy would make on every link of it. The retry suite
 * turns them back on and asserts them on their own.
 */
const runner = new ModelRunner(new FakeClock(), new NoRetryPolicy());

const CONTEXT = RunContextFixture.run();

describe("ModelRunner", () => {
	it("answers from the primary model when nothing fails", async () => {
		const primary = new ScriptedModel("primary", [ModelChunk.text("hi"), ModelChunk.finish("stop")]);

		const outcome = await runner.run(buildCommand(primary));

		expect(outcome.response.text).toBe("hi");
		expect(outcome.wasRerouted).toBe(false);
		expect(outcome.servedBy.toString()).toBe("acme/primary");
	});

	it("reroutes to the next model when the primary fails before its first chunk", async () => {
		const primary = new ScriptedModel("primary", [], new RateLimitedFailure("slow down"));
		const fallback = new ScriptedModel("fallback", [ModelChunk.text("from the fallback"), ModelChunk.finish("stop")]);

		const outcome = await runner.run(buildCommand(primary, new SequentialFailoverPolicy([fallback])));

		expect(outcome.response.text).toBe("from the fallback");
		expect(outcome.servedBy.toString()).toBe("acme/fallback");
		expect(primary.calls).toBe(1);
		expect(fallback.calls).toBe(1);
	});

	/**
	 * What the next model is handed, which is the half of a reroute nothing else asserts.
	 *
	 * The chain re-sends the request as it stands, so the model that takes over reads a
	 * conversation another provider wrote, tool calls included. That is a feature, since the
	 * point is to answer the same question; it is also why a call carrying provider specific
	 * data has to survive the crossing, and an adapter that refuses one turns a rescue into a
	 * dead run. Whoever changes this line has to change [[cross-provider-history]] with it.
	 */
	it("hands the next model the same request, tool calls and all", async () => {
		const inherited = new ModelRequest([
			new UserMessage("cade o pedido A-1?"),
			new ToolCallMessage(ToolCallId.from("c-1"), "find_order", { orderId: "A-1" }),
			new ToolResultMessage(ToolCallId.from("c-1"), "find_order", { status: "shipped" }, false),
		]);
		const primary = new ScriptedModel("primary", [], new RateLimitedFailure("slow down"));
		const fallback = new ScriptedModel("fallback", [ModelChunk.text("shipped"), ModelChunk.finish("stop")]);

		await runner.run(
			new ModelRunCommand({
				context: CONTEXT,
				runId: RUN,
				agent: AGENT,
				model: primary,
				request: inherited,
				failover: new SequentialFailoverPolicy([fallback]),
			}),
		);

		expect(fallback.requests.at(0)).toBe(inherited);
		expect(fallback.requests.at(0)?.messages.at(1)).toBeInstanceOf(ToolCallMessage);
		expect((fallback.requests.at(0)?.messages.at(1) as ToolCallMessage).signature).toBeUndefined();
	});

	it("records the reroute, with both models, the failure and the attempt", async () => {
		const primary = new ScriptedModel("primary", [], new RateLimitedFailure("slow down"));
		const fallback = new ScriptedModel("fallback", [ModelChunk.text("ok"), ModelChunk.finish("stop")]);

		const outcome = await runner.run(buildCommand(primary, new SequentialFailoverPolicy([fallback])));

		expect(outcome.reroutes).toHaveLength(1);
		expect(outcome.reroutes[0]?.from.toString()).toBe("acme/primary");
		expect(outcome.reroutes[0]?.to.toString()).toBe("acme/fallback");
		expect(outcome.reroutes[0]?.failure).toBeInstanceOf(RateLimitedFailure);
		expect(outcome.reroutes[0]?.attempt).toBe(1);
	});

	it("walks the whole queue, one model per failure", async () => {
		const primary = new ScriptedModel("primary", [], new RateLimitedFailure("slow down"));
		const second = new ScriptedModel("second", [], new UnavailableFailure("overloaded"));
		const third = new ScriptedModel("third", [ModelChunk.text("finally"), ModelChunk.finish("stop")]);

		const outcome = await runner.run(buildCommand(primary, new SequentialFailoverPolicy([second, third])));

		expect(outcome.response.text).toBe("finally");
		expect(outcome.reroutes.map((reroute) => reroute.to.toString())).toEqual(["acme/second", "acme/third"]);
	});

	it("attributes the answer to the model that served it, not to the one that failed", async () => {
		const primary = new ScriptedModel("primary", [], new RateLimitedFailure("slow down"));
		const fallback = new ScriptedModel("fallback", [
			ModelChunk.text("ok"),
			ModelChunk.usage(ModelUsage.fromReport(100, 40)),
			ModelChunk.finish("stop"),
		]);

		const outcome = await runner.run(buildCommand(primary, new SequentialFailoverPolicy([fallback])));

		expect(outcome.response.model.toString()).toBe("acme/fallback");
		expect(outcome.response.usage.inputTokens).toBe(100);
	});

	it("propagates a failure that happened after the first chunk, without rerouting", async () => {
		const primary = new ScriptedModel("primary", [ModelChunk.text("half")], new UnavailableFailure("died"), 1);
		const fallback = new ScriptedModel("fallback", [ModelChunk.text("never"), ModelChunk.finish("stop")]);

		const failure = await runner.run(buildCommand(primary, new SequentialFailoverPolicy([fallback]))).catch((e) => e);

		expect(failure).toBeInstanceOf(ModelCallFailedError);
		expect(fallback.calls).toBe(0);
	});

	it("propagates an error no adapter classified, since a bug is not a provider saying no", async () => {
		const broken = new BrokenModel();
		const fallback = new ScriptedModel("fallback", [ModelChunk.text("never"), ModelChunk.finish("stop")]);

		const failure = await runner.run(buildCommand(broken, new SequentialFailoverPolicy([fallback]))).catch((e) => e);

		expect(failure).toBeInstanceOf(TypeError);
		expect(fallback.calls).toBe(0);
	});

	it("propagates a capability failure without rerouting, because no model would fix it", async () => {
		const withTools = new ModelRequest([new UserMessage("hi")], [{ name: "t", description: "d", parameters: {} }]);
		const primary = new ScriptedModel("primary");
		const fallback = new ScriptedModel("fallback");

		const command = new ModelRunCommand({
			context: CONTEXT,
			runId: RUN,
			agent: AGENT,
			model: primary,
			request: withTools,
			failover: new SequentialFailoverPolicy([fallback]),
		});
		const failure = await runner.run(command).catch((error) => error);

		expect(failure).toBeInstanceOf(UnsupportedCapabilityError);
		expect(fallback.calls).toBe(0);
	});

	it("fails with the chain when the policy runs out of models", async () => {
		const primary = new ScriptedModel("primary", [], new RateLimitedFailure("slow down"));
		const second = new ScriptedModel("second", [], new UnavailableFailure("overloaded"));

		const failure = await runner.run(buildCommand(primary, new SequentialFailoverPolicy([second]))).catch((e) => e);

		expect(failure).toBeInstanceOf(ModelsExhaustedError);
		if (!(failure instanceof ModelsExhaustedError)) return;
		expect(failure.attempted).toEqual(["acme/primary", "acme/second"]);
		expect(failure.failureKinds).toEqual(["rate-limited", "unavailable"]);
		expect(failure.message).toContain("rate-limited");
	});

	it("fails at the first failure when the agent declared no policy", async () => {
		const primary = new ScriptedModel("primary", [], new UnknownFailure("boom"));

		const failure = await runner.run(buildCommand(primary)).catch((error) => error);

		expect(failure).toBeInstanceOf(ModelsExhaustedError);
		if (!(failure instanceof ModelsExhaustedError)) return;
		expect(failure.attempted).toEqual(["acme/primary"]);
	});

	it("tells the policy what the run knows, attempt by attempt", async () => {
		const primary = new ScriptedModel("primary", [], new RateLimitedFailure("slow down"));
		const second = new ScriptedModel("second", [], new UnavailableFailure("overloaded"));
		const third = new ScriptedModel("third", [ModelChunk.text("ok"), ModelChunk.finish("stop")]);
		const policy = new RecordingPolicy([second, third]);

		await runner.run(buildCommand(primary, policy));

		expect(policy.seen).toHaveLength(2);
		expect(policy.seen[0]?.attempts).toBe(1);
		expect(policy.seen[0]?.runId.value).toBe("run-1");
		expect(policy.seen[1]?.attempts).toBe(2);
		expect(policy.seen[1]?.failures.map((failure) => failure.kind)).toEqual(["rate-limited", "unavailable"]);
		expect(policy.seen[1]?.hasTried(primary)).toBe(true);
	});

	it("streams the chunks of whichever model ended up answering", async () => {
		const primary = new ScriptedModel("primary", [], new RateLimitedFailure("slow down"));
		const fallback = new ScriptedModel("fallback", [
			ModelChunk.text("from "),
			ModelChunk.text("the fallback"),
			ModelChunk.finish("stop"),
		]);

		const texts = await collect(runner, buildCommand(primary, new SequentialFailoverPolicy([fallback])));

		expect(texts.join("")).toBe("from the fallback");
	});
});

/** Fails the first `failures` calls and then answers, which is what a busy provider does. */
class FlakyModel extends LlmModel {
	public calls = 0;

	public constructor(
		private readonly name: string,
		private readonly failures: number,
		private readonly failure: ModelFailure,
		private readonly text = "ok",
	) {
		super();
	}

	public descriptor(): ModelDescriptor {
		return new ModelDescriptor(
			new ModelIdentity("acme", this.name),
			new ModelContextWindow(1000, 100),
			ModelCapabilities.none(),
		);
	}

	public async *generate(): AsyncIterable<ModelChunk> {
		this.calls += 1;
		if (this.calls <= this.failures) throw new ModelCallFailedError(this.failure, this.name);
		yield ModelChunk.text(this.text);
		yield ModelChunk.finish("stop");
	}
}

describe("ModelRunner retrying the same model", () => {
	/** Every delay is asserted, never waited for: the clock advances instead of the process. */
	function retrying(policy = new BackoffRetryPolicy(2, Duration.fromMillis(100), Duration.fromMillis(5000), () => 1)) {
		const clock = new FakeClock();
		return { clock, runner: new ModelRunner(clock, policy) };
	}

	it("asks the same model again after a transient failure, before any failover is consulted", async () => {
		const primary = new FlakyModel("primary", 1, new RateLimitedFailure("slow down"), "second time lucky");
		const fallback = new ScriptedModel("fallback", [ModelChunk.text("never"), ModelChunk.finish("stop")]);
		const { runner: retryingRunner } = retrying();

		const outcome = await retryingRunner.run(buildCommand(primary, new SequentialFailoverPolicy([fallback])));

		expect(outcome.response.text).toBe("second time lucky");
		expect(outcome.wasRerouted).toBe(false);
		expect(primary.calls).toBe(2);
		expect(fallback.calls).toBe(0);
	});

	it("waits exactly what the provider asked for when the failure carries a Retry-After", async () => {
		const primary = new FlakyModel("primary", 1, new RateLimitedFailure("slow down", undefined, Duration.fromSeconds(3)));
		const { clock, runner: retryingRunner } = retrying();

		await retryingRunner.run(buildCommand(primary));

		expect(clock.sleeps.map((slept) => slept.millis)).toEqual([3000]);
	});

	it("doubles the wait between its own attempts when the provider asked for nothing", async () => {
		const primary = new ScriptedModel("primary", [], new RateLimitedFailure("slow down"));
		const { clock, runner: retryingRunner } = retrying();

		await retryingRunner.run(buildCommand(primary)).catch(() => undefined);

		expect(clock.sleeps.map((slept) => slept.millis)).toEqual([100, 200]);
	});

	it("stops at the attempt ceiling and falls through to failover", async () => {
		const primary = new ScriptedModel("primary", [], new RateLimitedFailure("slow down"));
		const fallback = new ScriptedModel("fallback", [ModelChunk.text("rescued"), ModelChunk.finish("stop")]);
		const { runner: retryingRunner } = retrying();

		const outcome = await retryingRunner.run(buildCommand(primary, new SequentialFailoverPolicy([fallback])));

		expect(outcome.response.text).toBe("rescued");
		expect(primary.calls).toBe(3);
		expect(outcome.reroutes).toHaveLength(1);
	});

	it("never retries a failure the same request would meet again", async () => {
		const primary = new ScriptedModel("primary", [], new InvalidRequestFailure("bad schema"));
		const { clock, runner: retryingRunner } = retrying();

		await retryingRunner.run(buildCommand(primary)).catch(() => undefined);

		expect(primary.calls).toBe(1);
		expect(clock.sleeps).toHaveLength(0);
	});

	it("fails with the chain when neither the retries nor the failover have anything left", async () => {
		const primary = new ScriptedModel("primary", [], new RateLimitedFailure("slow down"));
		const { runner: retryingRunner } = retrying();

		const failure = await retryingRunner.run(buildCommand(primary)).catch((error) => error);

		expect(failure).toBeInstanceOf(ModelsExhaustedError);
		expect(primary.calls).toBe(3);
	});

	it("counts attempts per model, so a fresh provider starts with its own budget", async () => {
		const primary = new ScriptedModel("primary", [], new RateLimitedFailure("slow down"));
		const second = new ScriptedModel("second", [], new UnavailableFailure("overloaded"));
		const { runner: retryingRunner } = retrying();

		await retryingRunner.run(buildCommand(primary, new SequentialFailoverPolicy([second]))).catch(() => undefined);

		expect(primary.calls).toBe(3);
		expect(second.calls).toBe(3);
	});
});
