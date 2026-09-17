import { AdkError } from "../../common/errors/adk.error";

export class IdSequenceExhaustedError extends AdkError {
	public readonly code = "SUPPORT_ID_SEQUENCE_EXHAUSTED";

	public constructor(public readonly limit: number) {
		super(`SequenceIdGenerator produced its ${limit} allowed ids; raise the limit instead of expecting a random one.`);
	}
}
