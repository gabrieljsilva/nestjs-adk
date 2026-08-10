import type { SessionId } from "../../common/identity/session-id";
import { SessionRevision } from "../../common/revision/session-revision";
import type { Instant } from "../../common/time/instant";
import type { AgentName } from "../agent/agent-name";
import { InvertedSessionTimestampsError } from "./errors/inverted-session-timestamps.error";
import type { SessionOwner } from "./session-owner";
import { SessionStatus } from "./session-status";

/**
 * The head of a conversation: who owns it, which agent roots it and how far its
 * journal has advanced. The events are the truth; this is the entry point to them.
 *
 * Every conversation is kept the same way. There is no second kind that lives only as
 * long as the run that opened it: one is journaled, snapshotted and rehydrated exactly
 * like the next, so nothing here records an intention about how long it should last.
 * An owner is optional for the same reason, since the identifier is what finds a
 * conversation again and an application that chose that identifier already has it.
 */
export class Session {
	private constructor(
		public readonly id: SessionId,
		public readonly rootAgent: AgentName,
		public readonly status: SessionStatus,
		public readonly revision: SessionRevision,
		public readonly createdAt: Instant,
		public readonly updatedAt: Instant,
		public readonly owner?: SessionOwner,
	) {}

	public static start(id: SessionId, rootAgent: AgentName, createdAt: Instant, owner?: SessionOwner): Session {
		return new Session(id, rootAgent, SessionStatus.ACTIVE, SessionRevision.initial(), createdAt, createdAt, owner);
	}

	public static restore(
		id: SessionId,
		rootAgent: AgentName,
		status: SessionStatus,
		revision: SessionRevision,
		createdAt: Instant,
		updatedAt: Instant,
		owner?: SessionOwner,
	): Session {
		if (updatedAt.isBefore(createdAt)) throw new InvertedSessionTimestampsError(createdAt.toIso(), updatedAt.toIso());
		return new Session(id, rootAgent, status, revision, createdAt, updatedAt, owner);
	}

	public get acceptsCommands(): boolean {
		return this.status.acceptsCommands;
	}

	/** The same session after its journal advanced, which is the only way revision moves. */
	public at(revision: SessionRevision, updatedAt: Instant = this.updatedAt): Session {
		return new Session(this.id, this.rootAgent, this.status, revision, this.createdAt, updatedAt, this.owner);
	}

	public withStatus(status: SessionStatus): Session {
		return new Session(this.id, this.rootAgent, status, this.revision, this.createdAt, this.updatedAt, this.owner);
	}
}
