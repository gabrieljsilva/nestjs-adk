import { AdkError } from "../../../common/errors/adk.error";

/** A tool the runtime owns reached a model without the runtime binding it to anything that answers. */
export class UnboundRuntimeToolError extends AdkError {
	public readonly code = "UNBOUND_RUNTIME_TOOL";

	public constructor(public readonly toolName: string) {
		super(`Tool ${toolName} belongs to the runtime, and this runtime did not bind it to anything that answers it.`);
	}
}
