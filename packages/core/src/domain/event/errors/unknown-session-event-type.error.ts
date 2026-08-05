import { AdkError } from "../../../common/errors/adk.error";

/** No codec claims this event type, so nothing can rebuild it. */
export class UnknownSessionEventTypeError extends AdkError {
	public readonly code = "EVENT_UNKNOWN_TYPE";

	public constructor(public readonly eventType: string) {
		super(`No codec is registered for event type ${eventType}.`);
	}
}
