import type { AgentRunId } from "../../../common/identity/agent-run-id.value-object";
import type { SessionId } from "../../../common/identity/session-id.value-object";
import type { ToolCallId } from "../../../common/identity/tool-call-id.value-object";
import type { AgentName } from "../../agent/agent-name.value-object";
import { SessionContext } from "../../run/session-context.value-object";
import { SessionMetadata } from "../../session/metadata/session-metadata.value-object";
import type { Actor } from "../access/actor.value-object";

/**
 * What a tool is told about the run it is running inside.
 *
 * It is a value handed to one invocation and never a handle onto the runtime: a tool
 * cannot append events, resolve models or reach another session through it. The signal
 * is here because a tool is the most likely place for a run to be waiting when it is
 * cancelled, and a tool that ignores it keeps a shutdown waiting.
 *
 * It is the run's context narrowed to one call: `RunContext.toToolContext(callId)` is what
 * builds it, and the durable half travels across so a tool reads the same session metadata
 * every other component reads.
 */
export class ToolContext {
	public constructor(
		public readonly sessionId: SessionId,
		public readonly runId: AgentRunId,
		public readonly agent: AgentName,
		public readonly callId: ToolCallId,
		public readonly signal?: AbortSignal,
		/** Who this call runs on behalf of, when the caller said. Absent, nothing about the caller is known. */
		public readonly actor?: Actor,
		/** What the application knows about this conversation, folded from the journal. */
		public readonly metadata: SessionMetadata = SessionMetadata.empty(),
	) {}

	public get isCancelled(): boolean {
		return this.signal?.aborted === true;
	}

	/** What this call hands a port that acts on the conversation rather than on the run. */
	public toSessionContext(): SessionContext {
		return new SessionContext(this.sessionId, this.metadata);
	}
}
