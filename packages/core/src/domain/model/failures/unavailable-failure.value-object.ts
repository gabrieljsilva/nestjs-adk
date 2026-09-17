import type { Duration } from "../../../common/time/duration.value-object";
import { ModelFailure } from "./model-failure.value-object";

/** The provider is down, overloaded or unreachable. */
export class UnavailableFailure extends ModelFailure {
	public readonly kind = "unavailable";

	public constructor(
		message: string,
		cause?: unknown,
		private readonly askedFor?: Duration,
	) {
		super(message, cause);
	}

	public override get isTransient(): boolean {
		return true;
	}

	public override get retryAfter(): Duration | undefined {
		return this.askedFor;
	}
}
