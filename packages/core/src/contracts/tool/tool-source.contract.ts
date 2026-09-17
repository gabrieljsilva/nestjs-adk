import type { AgentRunId } from "../../common/identity/agent-run-id.value-object";
import type { SessionId } from "../../common/identity/session-id.value-object";
import type { ToolDefinition } from "../../domain/tool/tool-definition.value-object";

/**
 * Somewhere tools come from that is not the application itself, such as an MCP server. It is
 * opened once per run and closed when that run settles, however it settles.
 *
 * `open` may fail with `ToolSourceAuthError` or `ToolSourceUnavailableError`, and neither is a
 * failed run: the runtime leaves the source out. The signal is the run's own.
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
