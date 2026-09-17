import type { Duration } from "../../common/time/duration.value-object";
import type { RetryAttempt } from "./retry-attempt.value-object";

/**
 * Whether the same model is asked the same thing again, and after how long. The runtime asks this
 * before it consults failover, and answering nothing ends the attempts on that model.
 */
export abstract class ModelRetryPolicy {
	public abstract findDelay(attempt: RetryAttempt): Duration | undefined;
}
