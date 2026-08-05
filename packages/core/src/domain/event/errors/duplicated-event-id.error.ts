import { AdkError } from "../../../common/errors/adk.error";

/** Two facts cannot share an id: idempotency of the journal depends on it. */
export class DuplicatedEventIdError extends AdkError {
	public readonly code = "EVENT_DUPLICATED_ID";

	public constructor(public readonly eventId: string) {
		super(`Event id ${eventId} appears twice in the same batch; each fact carries its own id.`);
	}
}
