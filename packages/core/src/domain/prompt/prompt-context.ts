import type { AgentRunId } from "../../common/identity/agent-run-id";
import type { SessionId } from "../../common/identity/session-id";
import type { AgentName } from "../agent/agent-name";
import type { SessionOwner } from "../session/session-owner";

/**
 * What an agent knows about the run it is building a prompt for.
 *
 * It is everything the runtime can honestly say at that moment and nothing more. There is no
 * message here, and no conversation: the prompt is resolved once, before the first turn, so
 * anything about what was said would be a snapshot of one turn used for all of them.
 *
 * The owner is the key an application looks its own data up by. It is the session's owner
 * rather than the caller's argument, so a conversation continued tomorrow builds the prompt
 * for the same person it was started for.
 */
export class PromptContext {
	public constructor(
		public readonly sessionId: SessionId,
		public readonly runId: AgentRunId,
		/** Which agent is about to answer, which after a transfer is not the one that started. */
		public readonly agent: AgentName,
		public readonly owner?: SessionOwner,
		/** Stops a lookup that outlived the run it was for. */
		public readonly signal?: AbortSignal,
	) {}
}
