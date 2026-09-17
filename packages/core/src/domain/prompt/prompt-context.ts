import type { AgentRunId } from "../../common/identity/agent-run-id";
import type { SessionId } from "../../common/identity/session-id";
import type { AgentName } from "../agent/agent-name";
import { SessionMetadata } from "../session/metadata/session-metadata";
import type { Actor } from "../tool/access/actor";

/**
 * What an agent knows about the run it is building a prompt for.
 *
 * It is everything the runtime can honestly say at that moment and nothing more. There is no
 * message here, and no conversation: the prompt is resolved once, before the first turn, so
 * anything about what was said would be a snapshot of one turn used for all of them.
 *
 * The metadata is the durable half: the keys an application wrote on this conversation, folded
 * from the journal, so a conversation continued tomorrow builds the prompt from the same facts
 * it was started with. It is where the key an application looks its own data up by lives.
 *
 * The actor is the caller's argument, and that is the difference between the two: the metadata
 * says what is true of this conversation, the actor says who is asking now and with which
 * claims, which is what a prompt that names a workspace or a role reads. It is the same actor
 * every tool of the run receives, so what the instruction says and what the tools are allowed
 * to do come from one place.
 */
export class PromptContext {
	public constructor(
		public readonly sessionId: SessionId,
		public readonly runId: AgentRunId,
		/** Which agent is about to answer, which after a transfer is not the one that started. */
		public readonly agent: AgentName,
		/** What the application knows about this conversation, as durable as the conversation itself. */
		public readonly metadata: SessionMetadata = SessionMetadata.empty(),
		/** Stops a lookup that outlived the run it was for. */
		public readonly signal?: AbortSignal,
		public readonly actor?: Actor,
	) {}
}
