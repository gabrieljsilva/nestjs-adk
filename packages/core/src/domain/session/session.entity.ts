import type { SessionId } from "../../common/identity/session-id.value-object";
import { SessionRevision } from "../../common/revision/session-revision.value-object";
import type { Instant } from "../../common/time/instant.value-object";
import type { AgentName } from "../agent/agent-name.value-object";
import { InvertedSessionTimestampsError } from "./errors/inverted-session-timestamps.error";
import { SessionStatus } from "./session-status.value-object";

/**
 * The head of a conversation: which agent roots it and how far its journal has advanced.
 * The events are the truth; this is the entry point to them.
 *
 * Every conversation is kept the same way. There is no second kind that lives only as
 * long as the run that opened it: one is journaled, snapshotted and rehydrated exactly
 * like the next, so nothing here records an intention about how long it should last.
 *
 * Nothing here says who the conversation belongs to. The lib never checks who owns a
 * session, so an owner on the head would be a field it reads to nobody's benefit; an
 * application that needs one writes it as session metadata, where it is journaled, folded
 * into the state and readable by whatever decides.
 */
export class Session {
	private constructor(
		public readonly id: SessionId,
		public readonly rootAgent: AgentName,
		public readonly status: SessionStatus,
		public readonly revision: SessionRevision,
		public readonly createdAt: Instant,
		public readonly updatedAt: Instant,
	) {}

	public static start(id: SessionId, rootAgent: AgentName, createdAt: Instant): Session {
		return new Session(id, rootAgent, SessionStatus.ACTIVE, SessionRevision.initial(), createdAt, createdAt);
	}

	public static restore(
		id: SessionId,
		rootAgent: AgentName,
		status: SessionStatus,
		revision: SessionRevision,
		createdAt: Instant,
		updatedAt: Instant,
	): Session {
		if (updatedAt.isBefore(createdAt)) throw new InvertedSessionTimestampsError(createdAt.toIso(), updatedAt.toIso());
		return new Session(id, rootAgent, status, revision, createdAt, updatedAt);
	}

	public get acceptsCommands(): boolean {
		return this.status.acceptsCommands;
	}

	/** The same session after its journal advanced, which is the only way revision moves. */
	public at(revision: SessionRevision, updatedAt: Instant = this.updatedAt): Session {
		return new Session(this.id, this.rootAgent, this.status, revision, this.createdAt, updatedAt);
	}

	public withStatus(status: SessionStatus): Session {
		return new Session(this.id, this.rootAgent, status, this.revision, this.createdAt, this.updatedAt);
	}
}
