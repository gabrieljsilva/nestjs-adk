import { describe, expect, it } from "vitest";
import { AgentRunId } from "../../common/identity/agent-run-id";
import { ContextExceededFailure } from "../model/context-exceeded-failure";
import { InvalidRequestFailure } from "../model/invalid-request-failure";
import { LlmModel } from "../model/llm-model";
import { ModelCapabilities } from "../model/model-capabilities";
import type { ModelChunk } from "../model/model-chunk";
import { ModelContextWindow } from "../model/model-context-window";
import { ModelDescriptor } from "../model/model-descriptor";
import { ModelIdentity } from "../model/model-identity";
import { RateLimitedFailure } from "../model/rate-limited-failure";
import { FailoverContext } from "./failover-context";
import { SequentialFailoverPolicy } from "./sequential-failover-policy";

const RUN = AgentRunId.from("run-1");

/** A model that is never called: this policy decides from the queue and the count alone. */
class NamedModel extends LlmModel {
	public constructor(public readonly name: string) {
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
		// nothing to answer: the policy never generates
	}
}

const primary = new NamedModel("primary");
const second = new NamedModel("second");
const third = new NamedModel("third");

function contextAfter(attempts: number): FailoverContext {
	return new FailoverContext(RUN, primary, new Array(attempts).fill(primary), []);
}

describe("SequentialFailoverPolicy", () => {
	it("hands out the queue in order, one model per failure", async () => {
		const policy = new SequentialFailoverPolicy([second, third]);

		expect(await policy.next(new RateLimitedFailure("slow down"), contextAfter(1))).toBe(second);
		expect(await policy.next(new RateLimitedFailure("slow down"), contextAfter(2))).toBe(third);
	});

	it("ends the chain once the queue runs out", async () => {
		const policy = new SequentialFailoverPolicy([second]);

		expect(await policy.next(new RateLimitedFailure("slow down"), contextAfter(2))).toBeUndefined();
	});

	/**
	 * The next model is sent the same request, so a refused one is refused again.
	 * Walking the queue here costs a call per model to reach the answer the first one
	 * already gave, and hides it under a list of models that were never the problem.
	 */
	it("stops on a refused request instead of sending it to every model in the queue", async () => {
		const policy = new SequentialFailoverPolicy([second, third]);

		const next = await policy.next(new InvalidRequestFailure("400 unsupported field"), contextAfter(1));

		expect(next).toBeUndefined();
	});

	/** Permanent is not the test: a window too small for the prompt is what a bigger model is for. */
	it("still fails over when the failure is permanent but the request is fine", async () => {
		const policy = new SequentialFailoverPolicy([second]);

		const next = await policy.next(new ContextExceededFailure("too long"), contextAfter(1));

		expect(next).toBe(second);
	});
});
