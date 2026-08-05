import type { AgentRunId } from "../common/identity/agent-run-id";
import type { SessionId } from "../common/identity/session-id";
import type { ToolDefinition } from "../domain/tool/tool-definition";

/**
 * Somewhere tools come from that is not the application itself.
 *
 * An MCP server, a remote catalog, anything whose tools are discovered rather than
 * declared. It is opened once per run and closed when that run settles, however it
 * settles, because a connection held open by a run that failed is a leak and a
 * connection reopened per call is a handshake per call.
 *
 * `open` may fail with `ToolSourceAuthError`, which is not a failed run: the runtime
 * records that the source needs credentials again and lets the model carry on with the
 * tools it does have.
 */
export abstract class ToolSource {
	public abstract readonly name: string;

	public abstract open(sessionId: SessionId, runId: AgentRunId): Promise<readonly ToolDefinition[]>;

	/** Called exactly once per successful open, including when the run failed or was aborted. */
	public abstract close(runId: AgentRunId): Promise<void>;
}
