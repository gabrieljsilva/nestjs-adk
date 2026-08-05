import { AdkError } from "../../../common/errors/adk.error";

/**
 * Every model the failover policy offered has failed, and it offered no more.
 *
 * It carries the chain as it happened, because the useful question after an exhausted
 * failover is never just what failed last: rate limited then unavailable means one
 * thing, and unavailable then unavailable means another.
 */
export class ModelsExhaustedError extends AdkError {
	public readonly code = "AGENT_MODELS_EXHAUSTED";

	public constructor(
		public readonly agent: string,
		public readonly attempted: readonly string[],
		public readonly failureKinds: readonly string[],
	) {
		super(
			`Agent ${agent} exhausted its models after ${attempted.length} attempt(s): ${ModelsExhaustedError.chainOf(attempted, failureKinds)}`,
		);
	}

	private static chainOf(attempted: readonly string[], failureKinds: readonly string[]): string {
		return attempted.map((model, index) => `${model} (${failureKinds[index] ?? "unknown"})`).join(" then ");
	}
}
