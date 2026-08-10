import { SessionId } from "../../../common/identity/session-id";
import { SessionRevision } from "../../../common/revision/session-revision";
import { Instant } from "../../../common/time/instant";
import { AgentName } from "../../../domain/agent/agent-name";
import { Session } from "../../../domain/session/session";
import { SessionOwner } from "../../../domain/session/session-owner";
import { SessionStatus } from "../../../domain/session/session-status";
import { UnreadableStoredValueError } from "./errors/unreadable-stored-value.error";
import { SessionHeadRecord } from "./session-head-record";

/**
 * Turns the head of a session into a row and back.
 *
 * Status comes back as the one instance that denotes the word, because identity is what
 * `acceptsCommands` compares on: a copy carrying the same text would answer every question
 * wrongly. A word this build does not know stops the read rather than restoring a session
 * into a state that does not exist, which is what a row written by a newer build looks
 * like from here.
 *
 * A row written before conversations stopped declaring how long they meant to last still
 * carries that word. Nothing reads it, so it is left where it is.
 */
export class SessionHeadCodec {
	public encode(session: Session): SessionHeadRecord {
		return new SessionHeadRecord(
			session.id.value,
			session.rootAgent.value,
			session.status.toString(),
			session.revision.value,
			session.createdAt.toIso(),
			session.updatedAt.toIso(),
			session.owner?.value,
		);
	}

	/** Takes the record this codec wrote, or the row a driver handed the adapter back. */
	public decode(values: unknown): Session {
		const record = SessionHeadRecord.from(values);
		return Session.restore(
			SessionId.from(record.id),
			AgentName.from(record.rootAgent),
			this.statusOf(record.status),
			SessionRevision.of(record.revision),
			Instant.fromIso(record.createdAt),
			Instant.fromIso(record.updatedAt),
			record.owner === undefined ? undefined : SessionOwner.from(record.owner),
		);
	}

	private statusOf(value: string): SessionStatus {
		const status = SessionStatus.of(value);
		if (status === undefined) throw new UnreadableStoredValueError("status", value);
		return status;
	}
}
