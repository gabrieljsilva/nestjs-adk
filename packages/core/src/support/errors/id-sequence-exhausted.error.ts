import { AdkError } from "../../common/errors/adk.error";

/** The deterministic generator ran past its limit and refuses to fall back to randomness. */
export class IdSequenceExhaustedError extends AdkError {
	public readonly code = "SUPPORT_ID_SEQUENCE_EXHAUSTED";

	public constructor(public readonly limit: number) {
		super(`SequenceIdGenerator produced its ${limit} allowed ids; raise the limit instead of expecting a random one.`);
	}
}
