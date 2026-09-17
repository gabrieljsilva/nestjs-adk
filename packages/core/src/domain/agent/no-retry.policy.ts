import type { Duration } from "../../common/time/duration.value-object";
import { ModelRetryPolicy } from "./model-retry.policy";
import type { RetryAttempt } from "./retry-attempt.value-object";

/**
 * Never attempts the same model twice, which is what `@Agent({ retry: false })` declares.
 * It is a declared policy and not an absent one, which would leave the runtime's default in force.
 */
export class NoRetryPolicy extends ModelRetryPolicy {
	public findDelay(_attempt: RetryAttempt): Duration | undefined {
		return undefined;
	}
}
