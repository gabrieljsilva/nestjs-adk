import type { Duration } from "../../common/time/duration.value-object";
import { ModelRetryPolicy } from "./model-retry.policy";
import type { RetryAttempt } from "./retry-attempt.value-object";

/**
 * Never attempts the same model twice, which is what `@Agent({ retry: false })` declares.
 *
 * It is a class rather than an absent policy because absence means "whatever the runtime
 * decided", and an agent that must not repeat a call, because the call has an effect the
 * provider already performed, is saying something the runtime default would override.
 */
export class NoRetryPolicy extends ModelRetryPolicy {
	public findDelay(_attempt: RetryAttempt): Duration | undefined {
		return undefined;
	}
}
