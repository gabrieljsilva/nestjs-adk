import { AdkError } from "../../../common/errors/adk.error";

export class UnsupportedSessionEventVersionError extends AdkError {
	public readonly code = "EVENT_UNSUPPORTED_SCHEMA_VERSION";

	public constructor(
		public readonly eventType: string,
		public readonly found: number,
		public readonly supported: number,
	) {
		super(`Event ${eventType} was written at schema version ${found}, and this build understands up to ${supported}.`);
	}
}
