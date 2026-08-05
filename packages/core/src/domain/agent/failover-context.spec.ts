import { describe, expect, it } from "vitest";
import { AgentRunId } from "../../common/identity/agent-run-id";
import { LlmModel } from "../model/llm-model";
import { ModelCapabilities } from "../model/model-capabilities";
import type { ModelChunk } from "../model/model-chunk";
import { ModelContextWindow } from "../model/model-context-window";
import { ModelDescriptor } from "../model/model-descriptor";
import { ModelIdentity } from "../model/model-identity";
import { RateLimitedFailure } from "../model/rate-limited-failure";
import { FailoverContext } from "./failover-context";

const RUN = AgentRunId.from("run-1");

class NamedModel extends LlmModel {
	public constructor(private readonly name: string) {
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
		yield* [];
	}
}

const primary = new NamedModel("primary");
const fallback = new NamedModel("fallback");

describe("FailoverContext", () => {
	it("counts the current attempt among the attempts", () => {
		const context = new FailoverContext(RUN, primary, [primary], [new RateLimitedFailure("slow down")]);

		expect(context.attempts).toBe(1);
	});

	it("answers whether a model was already tried", () => {
		const context = new FailoverContext(RUN, fallback, [primary, fallback], []);

		expect(context.hasTried(primary)).toBe(true);
		expect(context.hasTried(new NamedModel("third"))).toBe(false);
	});

	it("copies the attempts, so a later one cannot rewrite an earlier decision", () => {
		const attempted = [primary];
		const context = new FailoverContext(RUN, primary, attempted, []);

		attempted.push(fallback);

		expect(context.attempts).toBe(1);
	});

	it("copies the failures for the same reason", () => {
		const failures = [new RateLimitedFailure("slow down")];
		const context = new FailoverContext(RUN, primary, [primary], failures);

		failures.push(new RateLimitedFailure("again"));

		expect(context.failures).toHaveLength(1);
	});

	it("carries the run the decision belongs to", () => {
		expect(new FailoverContext(RUN, primary, [primary], []).runId.value).toBe("run-1");
	});
});
