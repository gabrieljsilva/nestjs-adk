import {
	ContextExceededFailure,
	RateLimitedFailure,
	SafetyBlockedFailure,
	TimeoutFailure,
	UnavailableFailure,
	UnknownFailure,
} from "@nestjs-adk/core/native";
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

	it("leaves an unrecognised error unknown, and unknown is not transient", () => {
		const failure = mapper.toFailure(new ApiError("something else", 400, "invalid_request_error"));

		expect(failure).toBeInstanceOf(UnknownFailure);
		expect(failure.isTransient).toBe(false);
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
