import { AdkError } from "../../../common/errors/adk.error";
import type { ModelFailure } from "../model-failure";

/**
 * The bridge between a failure that was decided and an error that is thrown.
 *
 * `generate` streams, so it cannot answer with a failure: there is no return value to
 * put one in. The adapter classifies the raw provider error into a `ModelFailure` and
 * throws it wrapped in this, and the runtime unwraps it to ask the failover policy
 * what to do. Nothing downstream ever reads a status code again.
 */
export class ModelCallFailedError extends AdkError {
	public readonly code = "MODEL_CALL_FAILED";

	public constructor(
		public readonly failure: ModelFailure,
		public readonly model: string,
	) {
		super(`Model ${model} failed with a ${failure.kind} failure: ${failure.message}`);
	}

	/** True when the same model could plausibly answer if asked again. */
	public get isTransient(): boolean {
		return this.failure.isTransient;
	}
}
