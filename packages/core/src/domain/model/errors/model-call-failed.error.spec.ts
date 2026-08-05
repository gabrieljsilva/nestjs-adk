import { describe, expect, it } from "vitest";
import { AdkError } from "../../../common/errors/adk.error";
import { RateLimitedFailure } from "../rate-limited-failure";
import { UnknownFailure } from "../unknown-failure";
import { ModelCallFailedError } from "./model-call-failed.error";

describe("ModelCallFailedError", () => {
	it("carries a stable code", () => {
		expect(new ModelCallFailedError(new UnknownFailure("boom"), "acme/m-1").code).toBe("MODEL_CALL_FAILED");
	});

	it("carries the failure the adapter decided on", () => {
		const error = new ModelCallFailedError(new RateLimitedFailure("slow down"), "acme/m-1");

		expect(error.failure).toBeInstanceOf(RateLimitedFailure);
		expect(error.failure.isRateLimited).toBe(true);
	});

	it("names the model and the kind of failure in its message", () => {
		const error = new ModelCallFailedError(new RateLimitedFailure("slow down"), "acme/m-1");

		expect(error.message).toContain("acme/m-1");
		expect(error.message).toContain("rate-limited");
		expect(error.message).toContain("slow down");
	});

	it("reports transience from the failure, never from itself", () => {
		expect(new ModelCallFailedError(new RateLimitedFailure("slow down"), "m").isTransient).toBe(true);
		expect(new ModelCallFailedError(new UnknownFailure("boom"), "m").isTransient).toBe(false);
	});

	it("is an adk error", () => {
		expect(new ModelCallFailedError(new UnknownFailure("boom"), "m")).toBeInstanceOf(AdkError);
	});
});
