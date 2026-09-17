import { SessionId } from "../../../../common/identity/session-id.value-object";
import { SessionRevision } from "../../../../common/revision/session-revision.value-object";
import { Instant } from "../../../../common/time/instant.value-object";
import { AgentName } from "../../../../domain/agent/agent-name.value-object";
import { SessionStatus } from "../../../../domain/session/session-status.value-object";
import { Session } from "../../../../domain/session/session.entity";
import { UnreadableStoredValueError } from "../errors/unreadable-stored-value.error";
import { SessionHeadRecord } from "./session-head.record";

export class SessionHeadCodec {
	public encode(session: Session): SessionHeadRecord {
		return new SessionHeadRecord(
			session.id.value,
			session.rootAgent.value,
			session.status.toString(),
			session.revision.value,
			session.createdAt.toIso(),
			session.updatedAt.toIso(),
		);
	}

	public decode(values: unknown): Session {
		const record = SessionHeadRecord.from(values);
		return Session.restore(
			SessionId.from(record.id),
			AgentName.from(record.rootAgent),
			this.readStatus(record.status),
			new SessionRevision(record.revision),
			Instant.fromIso(record.createdAt),
			Instant.fromIso(record.updatedAt),
		);
	}

	private readStatus(value: string): SessionStatus {
		const status = SessionStatus.fromName(value);
		if (status === undefined) throw new UnreadableStoredValueError("status", value);
		return status;
	}
}
