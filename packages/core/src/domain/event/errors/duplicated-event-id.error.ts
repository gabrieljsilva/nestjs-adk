import { AdkError } from "../../../common/errors/adk.error";

export class DuplicatedEventIdError extends AdkError {
	public readonly code = "EVENT_DUPLICATED_ID";

	public constructor(public readonly eventId: string) {
		super(`Event id ${eventId} appears twice in the same batch; each fact carries its own id.`);
	}
}
