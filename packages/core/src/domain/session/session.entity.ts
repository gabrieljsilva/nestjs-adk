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
 * An application that needs an owner on a conversation writes it as session metadata.
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

	public at(revision: SessionRevision, updatedAt: Instant = this.updatedAt): Session {
		return new Session(this.id, this.rootAgent, this.status, revision, this.createdAt, updatedAt);
	}

	public withStatus(status: SessionStatus): Session {
		return new Session(this.id, this.rootAgent, status, this.revision, this.createdAt, this.updatedAt);
	}
}
