import { AdkError } from "../../../common/errors/adk.error";

/**
 * Every model the failover policy offered has failed, and it offered no more.
 * It carries the chain in the order it happened, the kind of each failure, and what the last
 * provider said.
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
			`Agent ${agent} exhausted its models after ${attempted.length} attempt(s): ${ModelsExhaustedError.buildChain(attempted, failureKinds)}${ModelsExhaustedError.saidBy(lastMessage)}`,
		);
	}

	private static buildChain(attempted: readonly string[], failureKinds: readonly string[]): string {
		return attempted.map((model, index) => `${model} (${failureKinds[index] ?? "unknown"})`).join(" then ");
	}

	private static saidBy(message?: string): string {
		return message === undefined || message === "" ? "" : `. The provider said: ${message}`;
	}
}
