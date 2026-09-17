import type { Duration } from "../../common/time/duration.value-object";
import type { RetryAttempt } from "./retry-attempt.value-object";

/**
 * Whether the same model is asked the same thing again, and after how long.
 *
 * It is the other half of resilience from `AgentFailoverPolicy` and deliberately a
 * separate component: retrying and rerouting answer different questions. A 429 with a
 * `Retry-After` is the provider saying "in four seconds", and spending the failover chain
 * on it costs a call per model to be told the same thing. A refused request is the
 * opposite: no wait makes it acceptable, and only another model might take it.
 *
 * The runtime asks this first and consults failover only once it answers nothing, so a
 * policy that declines is exactly today's behaviour.
 */
export abstract class ModelRetryPolicy {
	/** How long to wait before attempting the same model again, or nothing to stop attempting. */
	public abstract findDelay(attempt: RetryAttempt): Duration | undefined;
}
