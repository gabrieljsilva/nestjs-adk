import { AdkError } from "../../../common/errors/adk.error";

/**
 * Raised at boot: an agent declares a tool of its own under a name the runtime owns. The runtime
 * binds its own tool after the agent's, so the declared one would be dropped without a word.
 * Rename the declared tool.
 */
export class DuplicateRuntimeToolNameError extends AdkError {
	public readonly code = "CATALOG_DUPLICATE_RUNTIME_TOOL_NAME";

	public constructor(
		public readonly toolName: string,
		public readonly agentName: string,
		public readonly providerName: string,
	) {
		super(
			`Tool ${toolName} is declared by ${providerName} on agent ${agentName}, and ${toolName} is a tool the runtime owns. The runtime binds its own last, so the declared one would be dropped in silence: rename yours.`,
		);
	}
}
