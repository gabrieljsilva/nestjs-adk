import { AdkError } from "@nestjs-adk/core";

/** A decision was asked for on a run that is not waiting for one. */
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
