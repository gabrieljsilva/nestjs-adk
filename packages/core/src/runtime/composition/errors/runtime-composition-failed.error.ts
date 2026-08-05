import { AdkError } from "../../../common/errors/adk.error";

/**
 * The private container could not be built.
 * The original container error is preserved as `cause`, so a missing token or a
 * cycle stays diagnosable without leaking the container type into the public API.
 */
export class RuntimeCompositionFailedError extends AdkError {
	public readonly code = "RUNTIME_COMPOSITION_FAILED";

	public constructor(reason: string, cause: unknown) {
		super(`The ADK runtime could not be composed: ${reason}`, { cause });
	}
}
