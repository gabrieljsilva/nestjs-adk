import { AdkError } from "../../../common/errors/adk.error";

/** The class handed over was never decorated with `@Tool`, so it has no declaration to read. */
export class NotAToolClassError extends AdkError {
	public readonly code = "NOT_A_TOOL_CLASS";

	public constructor(public readonly candidate: string) {
		super(`${candidate} is not decorated with @Tool, so it has no tool declaration to read.`);
	}
}
