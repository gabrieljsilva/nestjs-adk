import { AdkError } from "../../../common/errors/adk.error";

/** Schema versions start at one and only ever move forward. */
export class InvalidEventSchemaVersionError extends AdkError {
	public readonly code = "EVENT_INVALID_SCHEMA_VERSION";

	public constructor(public readonly received: number) {
		super(`Event schema version must be a positive integer, received ${received}.`);
	}
}
