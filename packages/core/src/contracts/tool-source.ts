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
 * `open` may fail with `ToolSourceAuthError` or `ToolSourceUnavailableError`, and neither
 * is a failed run: the runtime leaves the source out and lets the model carry on with the
 * tools it does have. A conversation with fewer tools is worth more than no conversation.
 *
 * The signal is the run's own. Opening a source is I/O, often a handshake with something
 * across a network, and a run that was already abandoned must not sit through one.
 */
export abstract class ToolSource {
	public abstract readonly name: string;

	public abstract open(
		sessionId: SessionId,
		runId: AgentRunId,
		signal?: AbortSignal,
	): Promise<readonly ToolDefinition[]>;

	/** Called exactly once per successful open, including when the run failed or was aborted. */
	public abstract close(runId: AgentRunId): Promise<void>;
}
