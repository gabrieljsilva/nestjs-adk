import { AdkError } from "@nestjs-adk/core";

/** The conversation reached a turn whose guard the actual request does not satisfy. */
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
