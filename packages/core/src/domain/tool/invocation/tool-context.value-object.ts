import type { AgentRunId } from "../../../common/identity/agent-run-id.value-object";
import type { SessionId } from "../../../common/identity/session-id.value-object";
import type { ToolCallId } from "../../../common/identity/tool-call-id.value-object";
import type { AgentName } from "../../agent/agent-name.value-object";
import { SessionContext } from "../../run/session-context.value-object";
import { SessionMetadata } from "../../session/metadata/session-metadata.value-object";
import type { Actor } from "../access/actor.value-object";

/**
 * What a tool is told about the run it is running inside: a value for one invocation, never a
 * handle onto the runtime. A tool that awaits should honour `signal`, or it keeps a cancelled
 * run waiting for it.
 */
export class ToolContext {
	public constructor(
		public readonly sessionId: SessionId,
		public readonly runId: AgentRunId,
		public readonly agent: AgentName,
		public readonly callId: ToolCallId,
		public readonly signal?: AbortSignal,
		public readonly actor?: Actor,
		public readonly metadata: SessionMetadata = SessionMetadata.empty(),
	) {}

	public get isCancelled(): boolean {
		return this.signal?.aborted === true;
	}

	public toSessionContext(): SessionContext {
		return new SessionContext(this.sessionId, this.metadata);
	}
}
