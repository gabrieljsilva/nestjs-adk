import { AdkError } from "../../../common/errors/adk.error";

export class RuntimeCompositionFailedError extends AdkError {
	public readonly code = "RUNTIME_COMPOSITION_FAILED";

	public constructor(reason: string, cause: unknown) {
		super(`The ADK runtime could not be composed: ${reason}`, { cause });
	}
}
