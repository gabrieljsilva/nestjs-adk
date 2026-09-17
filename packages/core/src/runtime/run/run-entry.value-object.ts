import type { SessionId } from "../../common/identity/session-id.value-object";
import type { AgentDefinition } from "../../domain/agent/agent-definition.value-object";
import type { OpenedSession } from "../session/opened-session.value-object";

/**
 * Where a command enters: the conversation it belongs to and the agent that answers in it.
 *
 * The session is present only when there was one to read. A command beginning a
 * conversation names an id that nothing has been written under yet, and the conversation is
 * created later, after the edges of the run have been checked.
 */
export class RunEntry {
	public constructor(
		public readonly sessionId: SessionId,
		public readonly agent: AgentDefinition,
		public readonly session?: OpenedSession,
	) {}
}
