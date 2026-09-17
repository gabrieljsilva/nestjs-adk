import { AdkError } from "../../../common/errors/adk.error";
import type { ModelFailure } from "../failures/model-failure.value-object";

/**
 * A `ModelFailure` an adapter classified, thrown rather than returned because `generate`
 * streams and has no return value to carry one.
 * The runtime unwraps it to decide on retry and failover; nothing downstream reads a status code.
 */
export class ModelCallFailedError extends AdkError {
	public readonly code = "MODEL_CALL_FAILED";

	public constructor(
		public readonly failure: ModelFailure,
		public readonly model: string,
	) {
		super(`Model ${model} failed with a ${failure.kind} failure: ${failure.message}`);
	}

	public get isTransient(): boolean {
		return this.failure.isTransient;
	}
}
