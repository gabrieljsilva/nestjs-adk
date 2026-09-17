import { describe, expect, it } from "vitest";
import { Duration } from "../../common/time/duration.value-object";
import { ModelIdentity } from "../model/descriptor/model-identity.value-object";
import { ContextExceededFailure } from "../model/failures/context-exceeded-failure.value-object";
import { InvalidRequestFailure } from "../model/failures/invalid-request-failure.value-object";
import type { ModelFailure } from "../model/failures/model-failure.value-object";
import { RateLimitedFailure } from "../model/failures/rate-limited-failure.value-object";
import { UnavailableFailure } from "../model/failures/unavailable-failure.value-object";
import { UnknownFailure } from "../model/failures/unknown-failure.value-object";
import { BackoffRetryPolicy } from "./backoff-retry.policy";
import { RetryAttempt } from "./retry-attempt.value-object";

const MODEL = new ModelIdentity("acme", "primary");
const attemptOf = (failure: ModelFailure, number = 1) => new RetryAttempt(failure, MODEL, number);
/** Jitter pinned at its maximum, so the spec asserts the window rather than a range. */
const policyOf = (retries = 2) =>
	new BackoffRetryPolicy(retries, Duration.fromMillis(100), Duration.fromMillis(1000), () => 1);

describe("BackoffRetryPolicy", () => {
	it("waits what the provider asked for when the failure carries a Retry-After", () => {
		const failure = new RateLimitedFailure("slow down", undefined, Duration.fromMillis(800));

		expect(policyOf().findDelay(attemptOf(failure))?.millis).toBe(800);
	});

	it("caps what the provider asked for, because a header is not an unbounded promise", () => {
		const failure = new UnavailableFailure("come back later", undefined, Duration.fromSeconds(600));

		expect(policyOf().findDelay(attemptOf(failure))?.millis).toBe(1000);
	});

	it("doubles the window per attempt when the provider asked for nothing", () => {
		const failure = new RateLimitedFailure("slow down");

		expect(policyOf().findDelay(attemptOf(failure, 1))?.millis).toBe(100);
		expect(policyOf().findDelay(attemptOf(failure, 2))?.millis).toBe(200);
	});

	it("jitters the window down rather than up, so throttled callers do not return together", () => {
		const policy = new BackoffRetryPolicy(2, Duration.fromMillis(100), Duration.fromMillis(1000), () => 0.25);

		expect(policy.findDelay(attemptOf(new RateLimitedFailure("slow down"), 2))?.millis).toBe(50);
	});

	it("stops once the attempts it allows are spent", () => {
		const failure = new RateLimitedFailure("slow down");

		expect(policyOf(2).findDelay(attemptOf(failure, 3))).toBeUndefined();
		expect(policyOf(0).findDelay(attemptOf(failure, 1))).toBeUndefined();
	});

	it("never retries a failure the same request would meet again", () => {
		expect(policyOf().findDelay(attemptOf(new InvalidRequestFailure("bad schema")))).toBeUndefined();
		expect(policyOf().findDelay(attemptOf(new ContextExceededFailure("too long")))).toBeUndefined();
		expect(policyOf().findDelay(attemptOf(new UnknownFailure("boom")))).toBeUndefined();
	});
});
