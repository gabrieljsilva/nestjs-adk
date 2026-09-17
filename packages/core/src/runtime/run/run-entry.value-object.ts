import type { SessionId } from "../../common/identity/session-id.value-object";
import type { AgentDefinition } from "../../domain/agent/agent-definition.value-object";
import type { OpenedSession } from "../session/opened-session.value-object";

export class RunEntry {
	public constructor(
		public readonly sessionId: SessionId,
		public readonly agent: AgentDefinition,
		public readonly session?: OpenedSession,
	) {}
}
