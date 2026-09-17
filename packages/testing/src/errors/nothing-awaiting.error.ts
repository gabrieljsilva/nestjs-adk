import { AdkError } from "@nestjs-adk/core";

/**
 * An approval or a rejection was asked for while the run is not waiting on one, or is waiting on
 * a different tool. The message says what it is waiting on.
 */
export class NothingAwaitingError extends AdkError {
	public readonly code = "NOTHING_AWAITING";

	public constructor(
		public readonly tool: string | undefined,
		public readonly awaiting: readonly string[],
	) {
		super(
			`The run is not waiting for approval${tool === undefined ? "" : ` on ${tool}`}. Waiting on: ${
				awaiting.length === 0 ? "nothing" : awaiting.join(", ")
			}.`,
		);
	}
}
