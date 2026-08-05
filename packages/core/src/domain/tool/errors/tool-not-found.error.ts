import { AdkError } from "../../../common/errors/adk.error";

/**
 * The model asked for a tool this agent does not offer.
 *
 * It carries what is on offer, because the usual cause is a name the model invented
 * near a real one, and the fix is to hand the list back and let it choose again.
 */
export class ToolNotFoundError extends AdkError {
	public readonly code = "TOOL_NOT_FOUND";

	public constructor(
		public readonly toolName: string,
		public readonly available: readonly string[],
	) {
		super(`Tool ${toolName} is not available; this agent offers ${available.join(", ") || "no tools"}.`);
	}
}
