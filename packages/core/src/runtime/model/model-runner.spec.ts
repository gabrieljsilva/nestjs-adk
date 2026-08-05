import { describe, expect, it } from "vitest";
import { AgentRunId } from "../../common/identity/agent-run-id";
import { AgentFailoverPolicy } from "../../domain/agent/agent-failover-policy";
import { AgentName } from "../../domain/agent/agent-name";
import { ModelsExhaustedError } from "../../domain/agent/errors/models-exhausted.error";
import type { FailoverContext } from "../../domain/agent/failover-context";
import { SequentialFailoverPolicy } from "../../domain/agent/sequential-failover-policy";
import { ModelCallFailedError } from "../../domain/model/errors/model-call-failed.error";
import { UnsupportedCapabilityError } from "../../domain/model/errors/unsupported-capability.error";
import { LlmModel } from "../../domain/model/llm-model";
import { ModelCapabilities } from "../../domain/model/model-capabilities";
import { ModelChunk } from "../../domain/model/model-chunk";
import { ModelContextWindow } from "../../domain/model/model-context-window";
import { ModelDescriptor } from "../../domain/model/model-descriptor";
import type { ModelFailure } from "../../domain/model/model-failure";
import { ModelIdentity } from "../../domain/model/model-identity";
import { ModelRequest } from "../../domain/model/model-request";
import { ModelUsage } from "../../domain/model/model-usage";
import { RateLimitedFailure } from "../../domain/model/rate-limited-failure";
import { UnavailableFailure } from "../../domain/model/unavailable-failure";
import { UnknownFailure } from "../../domain/model/unknown-failure";
import { UserMessage } from "../../domain/model/user-message";
import { ModelRunCommand } from "./model-run-command";
import { ModelRunner } from "./model-runner";

const RUN = AgentRunId.from("run-1");
const AGENT = AgentName.from("support");
const request = new ModelRequest([new UserMessage("hi")]);

/** Answers a script, or fails in a way an adapter would have classified. */
class ScriptedModel extends LlmModel {
	public calls = 0;

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
			ModelIdentity.of("acme", this.name),
			ModelContextWindow.of(1000, 100),
			ModelCapabilities.none(),
		);
	}

	public async *generate(): AsyncIterable<ModelChunk> {
		this.calls += 1;
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
			ModelIdentity.of("acme", "broken"),
			ModelContextWindow.of(1000, 100),
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

function commandOf(model: LlmModel, failover?: AgentFailoverPolicy): ModelRunCommand {
	return new ModelRunCommand(RUN, AGENT, model, request, failover);
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

const runner = new ModelRunner();

describe("ModelRunner", () => {
	it("answers from the primary model when nothing fails", async () => {
		const primary = new ScriptedModel("primary", [ModelChunk.text("hi"), ModelChunk.finish("stop")]);

		const outcome = await runner.run(commandOf(primary));

		expect(outcome.response.text).toBe("hi");
		expect(outcome.wasRerouted).toBe(false);
		expect(outcome.servedBy.toString()).toBe("acme/primary");
	});

	it("reroutes to the next model when the primary fails before its first chunk", async () => {
		const primary = new ScriptedModel("primary", [], new RateLimitedFailure("slow down"));
		const fallback = new ScriptedModel("fallback", [ModelChunk.text("from the fallback"), ModelChunk.finish("stop")]);

		const outcome = await runner.run(commandOf(primary, new SequentialFailoverPolicy([fallback])));

		expect(outcome.response.text).toBe("from the fallback");
		expect(outcome.servedBy.toString()).toBe("acme/fallback");
		expect(primary.calls).toBe(1);
		expect(fallback.calls).toBe(1);
	});

	it("records the reroute, with both models, the failure and the attempt", async () => {
		const primary = new ScriptedModel("primary", [], new RateLimitedFailure("slow down"));
		const fallback = new ScriptedModel("fallback", [ModelChunk.text("ok"), ModelChunk.finish("stop")]);

		const outcome = await runner.run(commandOf(primary, new SequentialFailoverPolicy([fallback])));

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

		const outcome = await runner.run(commandOf(primary, new SequentialFailoverPolicy([second, third])));

		expect(outcome.response.text).toBe("finally");
		expect(outcome.reroutes.map((reroute) => reroute.to.toString())).toEqual(["acme/second", "acme/third"]);
	});

	it("attributes the answer to the model that served it, not to the one that failed", async () => {
		const primary = new ScriptedModel("primary", [], new RateLimitedFailure("slow down"));
		const fallback = new ScriptedModel("fallback", [
			ModelChunk.text("ok"),
			ModelChunk.usage(ModelUsage.of(100, 40)),
			ModelChunk.finish("stop"),
		]);

		const outcome = await runner.run(commandOf(primary, new SequentialFailoverPolicy([fallback])));

		expect(outcome.response.model.toString()).toBe("acme/fallback");
		expect(outcome.response.usage.inputTokens).toBe(100);
	});

	it("propagates a failure that happened after the first chunk, without rerouting", async () => {
		const primary = new ScriptedModel("primary", [ModelChunk.text("half")], new UnavailableFailure("died"), 1);
		const fallback = new ScriptedModel("fallback", [ModelChunk.text("never"), ModelChunk.finish("stop")]);

		const failure = await runner.run(commandOf(primary, new SequentialFailoverPolicy([fallback]))).catch((e) => e);

		expect(failure).toBeInstanceOf(ModelCallFailedError);
		expect(fallback.calls).toBe(0);
	});

	it("propagates an error no adapter classified, since a bug is not a provider saying no", async () => {
		const broken = new BrokenModel();
		const fallback = new ScriptedModel("fallback", [ModelChunk.text("never"), ModelChunk.finish("stop")]);

		const failure = await runner.run(commandOf(broken, new SequentialFailoverPolicy([fallback]))).catch((e) => e);

		expect(failure).toBeInstanceOf(TypeError);
		expect(fallback.calls).toBe(0);
	});

	it("propagates a capability failure without rerouting, because no model would fix it", async () => {
		const withTools = new ModelRequest([new UserMessage("hi")], [{ name: "t", description: "d", parameters: {} }]);
		const primary = new ScriptedModel("primary");
		const fallback = new ScriptedModel("fallback");

		const command = new ModelRunCommand(RUN, AGENT, primary, withTools, new SequentialFailoverPolicy([fallback]));
		const failure = await runner.run(command).catch((error) => error);

		expect(failure).toBeInstanceOf(UnsupportedCapabilityError);
		expect(fallback.calls).toBe(0);
	});

	it("fails with the chain when the policy runs out of models", async () => {
		const primary = new ScriptedModel("primary", [], new RateLimitedFailure("slow down"));
		const second = new ScriptedModel("second", [], new UnavailableFailure("overloaded"));

		const failure = await runner.run(commandOf(primary, new SequentialFailoverPolicy([second]))).catch((e) => e);

		expect(failure).toBeInstanceOf(ModelsExhaustedError);
		if (!(failure instanceof ModelsExhaustedError)) return;
		expect(failure.attempted).toEqual(["acme/primary", "acme/second"]);
		expect(failure.failureKinds).toEqual(["rate-limited", "unavailable"]);
		expect(failure.message).toContain("rate-limited");
	});

	it("fails at the first failure when the agent declared no policy", async () => {
		const primary = new ScriptedModel("primary", [], new UnknownFailure("boom"));

		const failure = await runner.run(commandOf(primary)).catch((error) => error);

		expect(failure).toBeInstanceOf(ModelsExhaustedError);
		if (!(failure instanceof ModelsExhaustedError)) return;
		expect(failure.attempted).toEqual(["acme/primary"]);
	});

	it("tells the policy what the run knows, attempt by attempt", async () => {
		const primary = new ScriptedModel("primary", [], new RateLimitedFailure("slow down"));
		const second = new ScriptedModel("second", [], new UnavailableFailure("overloaded"));
		const third = new ScriptedModel("third", [ModelChunk.text("ok"), ModelChunk.finish("stop")]);
		const policy = new RecordingPolicy([second, third]);

		await runner.run(commandOf(primary, policy));

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

		const texts = await collect(runner, commandOf(primary, new SequentialFailoverPolicy([fallback])));

		expect(texts.join("")).toBe("from the fallback");
	});
});
