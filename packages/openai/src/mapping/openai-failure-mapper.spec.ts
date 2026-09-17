import {
	ContextExceededFailure,
	RateLimitedFailure,
	SafetyBlockedFailure,
	TimeoutFailure,
	UnavailableFailure,
	UnknownFailure,
} from "@nestjs-adk/core";
import { describe, expect, it } from "vitest";
import { OpenAiFailureMapper } from "./openai-failure-mapper";

const mapper = new OpenAiFailureMapper();

/** The shape the OpenAI SDK gives an API error, and every compatible gateway imitates. */
class ApiError extends Error {
	public constructor(
		message: string,
		public readonly status?: number,
		public readonly code?: string,
		public readonly type?: string,
	) {
		super(message);
	}
}

class APIConnectionTimeoutError extends Error {}
class APIConnectionError extends Error {}

describe("OpenAiFailureMapper", () => {
	it("reads 429 as rate limited, which is transient", () => {
		const failure = mapper.toFailure(new ApiError("slow down", 429, "rate_limit_exceeded"));

		expect(failure).toBeInstanceOf(RateLimitedFailure);
		expect(failure.isTransient).toBe(true);
	});

	it("reads a 5xx as unavailable", () => {
		expect(mapper.toFailure(new ApiError("bad gateway", 502))).toBeInstanceOf(UnavailableFailure);
		expect(mapper.toFailure(new ApiError("overloaded", 503))).toBeInstanceOf(UnavailableFailure);
	});

	it("reads a context overflow as context exceeded, which is not transient", () => {
		const failure = mapper.toFailure(new ApiError("too long", 400, "context_length_exceeded"));

		expect(failure).toBeInstanceOf(ContextExceededFailure);
		expect(failure.isTransient).toBe(false);
	});

	it("reads a content filter as safety blocked, by code or by type", () => {
		expect(mapper.toFailure(new ApiError("filtered", 400, "content_filter"))).toBeInstanceOf(SafetyBlockedFailure);
		expect(mapper.toFailure(new ApiError("filtered", 400, undefined, "content_policy_violation"))).toBeInstanceOf(
			SafetyBlockedFailure,
		);
	});

	it("reads a timeout from the status, the code or the error class", () => {
		expect(mapper.toFailure(new ApiError("too slow", 408))).toBeInstanceOf(TimeoutFailure);
		expect(mapper.toFailure(new ApiError("too slow", undefined, "ETIMEDOUT"))).toBeInstanceOf(TimeoutFailure);
		expect(mapper.toFailure(new APIConnectionTimeoutError("timed out"))).toBeInstanceOf(TimeoutFailure);
	});

	it("reads a request that never arrived as unavailable", () => {
		expect(mapper.toFailure(new APIConnectionError("socket hang up"))).toBeInstanceOf(UnavailableFailure);
		expect(mapper.toFailure(new ApiError("refused", undefined, "ECONNREFUSED"))).toBeInstanceOf(UnavailableFailure);
	});

	/**
	 * The one the suites hit: `gpt-5.6-luna` refuses function tools while a reasoning
	 * effort is set, and says so in a 400. Read as unknown it looked like a bad day at
	 * the provider, and a failover chain sent the same refused request to every model.
	 */
	it("reads a 4xx that is none of the above as the request being refused", () => {
		const raw = new ApiError("Function tools with reasoning_effort are not supported", 400, "invalid_request_error");

		const failure = mapper.toFailure(raw);

		expect(failure.isInvalidRequest).toBe(true);
		expect(failure.kind).toBe("invalid-request");
		expect(failure.isTransient).toBe(false);
	});

	it("reads a rejected key and a model that does not exist the same way", () => {
		expect(mapper.toFailure(new ApiError("incorrect api key", 401)).isInvalidRequest).toBe(true);
		expect(mapper.toFailure(new ApiError("no such model", 404)).isInvalidRequest).toBe(true);
	});

	it("leaves an unrecognised error unknown, and unknown is not transient", () => {
		const failure = mapper.toFailure(new ApiError("something else", undefined, "eperm"));

		expect(failure).toBeInstanceOf(UnknownFailure);
		expect(failure.isTransient).toBe(false);
		expect(failure.isInvalidRequest).toBe(false);
	});

	it("keeps the provider message and the original error", () => {
		const raw = new ApiError("slow down", 429);

		const failure = mapper.toFailure(raw);

		expect(failure.message).toBe("slow down");
		expect(failure.cause).toBe(raw);
	});

	it("survives an error that is not an Error at all", () => {
		expect(mapper.toFailure("boom").message).toBe("boom");
		expect(mapper.toFailure(undefined).message).toContain("without a message");
	});
});
