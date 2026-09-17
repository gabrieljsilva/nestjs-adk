import { AdkError } from "@nestjs-adk/core";

/**
 * A scripted turn guarded by `expecting` was reached by a request that does not satisfy it. The
 * message names the turn, what it demanded and what arrived instead.
 */
export class ScriptDeviationError extends AdkError {
	public readonly code = "SCRIPT_DEVIATION";

	public constructor(
		public readonly model: string,
		public readonly turn: number,
		public readonly expected: string,
		public readonly received: string,
	) {
		super(
			`Turn ${turn} of the "${model}" script expected ${expected}, and the request that arrived does not satisfy it. Received: ${received}`,
		);
	}
}
