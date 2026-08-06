import { AdkError } from "../../../common/errors/adk.error";

/**
 * Every model the failover policy offered has failed, and it offered no more.
 *
 * It carries the chain as it happened, because the useful question after an exhausted
 * failover is never just what failed last: rate limited then unavailable means one
 * thing, and unavailable then unavailable means another.
 *
 * The last provider message is quoted at the end, and that is not decoration. A kind is
 * what a policy decides on, and `unknown` is a legitimate kind: without the words behind
 * it, an application looking at a 400 it could fix is told only that something unknown
 * happened to a model whose name it already knew.
 */
export class ModelsExhaustedError extends AdkError {
	public readonly code = "AGENT_MODELS_EXHAUSTED";

	public constructor(
		public readonly agent: string,
		public readonly attempted: readonly string[],
		public readonly failureKinds: readonly string[],
		public readonly lastMessage?: string,
	) {
		super(
			`Agent ${agent} exhausted its models after ${attempted.length} attempt(s): ${ModelsExhaustedError.chainOf(attempted, failureKinds)}${ModelsExhaustedError.saidBy(lastMessage)}`,
		);
	}

	private static chainOf(attempted: readonly string[], failureKinds: readonly string[]): string {
		return attempted.map((model, index) => `${model} (${failureKinds[index] ?? "unknown"})`).join(" then ");
	}

	private static saidBy(message?: string): string {
		return message === undefined || message === "" ? "" : `. The provider said: ${message}`;
	}
}
