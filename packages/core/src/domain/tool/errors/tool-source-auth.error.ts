import { AdkError } from "../../../common/errors/adk.error";

/**
 * A tool source would not let the runtime in.
 *
 * It is the one failure of a source that is not a failure of the run: credentials
 * expire, and a conversation that can still be had with the tools that did open is
 * better than one that ends because a remote catalog wants a new token. The runtime
 * records it so somebody can act on it, and carries on.
 */
export class ToolSourceAuthError extends AdkError {
	public readonly code = "TOOL_SOURCE_AUTH";

	public constructor(
		public readonly source: string,
		public readonly reason: string,
	) {
		super(`Tool source ${source} needs to be authorized again: ${reason}`);
	}
}
