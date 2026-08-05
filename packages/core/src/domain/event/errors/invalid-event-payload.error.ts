import { AdkError } from "../../../common/errors/adk.error";

/** The stored payload does not match what the codec requires, so no instance is built. */
export class InvalidEventPayloadError extends AdkError {
	public readonly code = "EVENT_INVALID_PAYLOAD";

	public constructor(
		public readonly eventType: string,
		public readonly field: string,
		public readonly reason: string,
	) {
		super(`Event ${eventType} has an invalid payload at ${field}: ${reason}`);
	}
}
