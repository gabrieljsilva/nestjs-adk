import type { AgentRunId } from "../../common/identity/agent-run-id";
import type { SessionId } from "../../common/identity/session-id";
import type { ToolCallId } from "../../common/identity/tool-call-id";
import type { AgentName } from "../agent/agent-name";

/**
 * What a tool is told about the run it is running inside.
 *
 * It is a value handed to one invocation and never a handle onto the runtime: a tool
 * cannot append events, resolve models or reach another session through it. The signal
 * is here because a tool is the most likely place for a run to be waiting when it is
 * cancelled, and a tool that ignores it keeps a shutdown waiting.
 */
export class ToolContext {
	public constructor(
		public readonly sessionId: SessionId,
		public readonly runId: AgentRunId,
		public readonly agent: AgentName,
		public readonly callId: ToolCallId,
		public readonly signal?: AbortSignal,
	) {}

	public get isCancelled(): boolean {
		return this.signal?.aborted === true;
	}
}
