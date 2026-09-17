import { describe, expect, it } from "vitest";
import { ModelIdentity } from "../model/descriptor/model-identity.value-object";
import { RateLimitedFailure } from "../model/failures/rate-limited-failure.value-object";
import { NoRetryPolicy } from "./no-retry.policy";
import { RetryAttempt } from "./retry-attempt.value-object";

describe("NoRetryPolicy", () => {
	it("answers nothing even for a failure another policy would wait on", () => {
		const attempt = new RetryAttempt(new RateLimitedFailure("slow down"), new ModelIdentity("acme", "primary"), 1);

		expect(new NoRetryPolicy().findDelay(attempt)).toBeUndefined();
	});
});
