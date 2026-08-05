import {
	ContextExceededFailure,
	RateLimitedFailure,
	SafetyBlockedFailure,
	TimeoutFailure,
	UnavailableFailure,
	UnknownFailure,
} from "@nestjs-adk/core";
import { describe, expect, it } from "vitest";
import { GeminiFailureMapper } from "./gemini-failure-mapper";

const mapper = new GeminiFailureMapper();

/** The shape the genai SDK throws: a message, and a status the API returned. */
class ApiError extends Error {
	public constructor(
		message: string,
		public readonly status?: number,
	) {
		super(message);
	}
}

describe("GeminiFailureMapper", () => {
	it("reads 429 as rate limited, which is transient", () => {
		const failure = mapper.toFailure(new ApiError("quota exceeded", 429));

		expect(failure).toBeInstanceOf(RateLimitedFailure);
		expect(failure.isTransient).toBe(true);
	});

	it("reads RESOURCE_EXHAUSTED as rate limited even without a status", () => {
		expect(mapper.toFailure(new Error("RESOURCE_EXHAUSTED"))).toBeInstanceOf(RateLimitedFailure);
	});

	it("reads a 5xx as unavailable", () => {
		expect(mapper.toFailure(new ApiError("model overloaded", 503))).toBeInstanceOf(UnavailableFailure);
	});

	it("tells a context overflow apart from any other 400", () => {
		const overflow = mapper.toFailure(new ApiError("input token count exceeds the maximum", 400));
		const other = mapper.toFailure(new ApiError("invalid argument", 400));

		expect(overflow).toBeInstanceOf(ContextExceededFailure);
		expect(overflow.isTransient).toBe(false);
		expect(other).toBeInstanceOf(UnknownFailure);
	});

	it("reads a safety block from the finish reason", () => {
		const failure = mapper.toFailure(Object.assign(new Error("blocked"), { finishReason: "SAFETY" }));

		expect(failure).toBeInstanceOf(SafetyBlockedFailure);
	});

	it("reads a safety block from the block reason of the prompt", () => {
		const failure = mapper.toFailure(Object.assign(new Error("blocked"), { blockReason: "PROHIBITED_CONTENT" }));

		expect(failure).toBeInstanceOf(SafetyBlockedFailure);
	});

	it("reads a deadline as a timeout", () => {
		expect(mapper.toFailure(new ApiError("DEADLINE_EXCEEDED", 504))).toBeInstanceOf(TimeoutFailure);
		expect(mapper.toFailure(new Error("request timeout"))).toBeInstanceOf(TimeoutFailure);
	});

	it("reads a request that never arrived as unavailable", () => {
		expect(mapper.toFailure(new Error("fetch failed"))).toBeInstanceOf(UnavailableFailure);
		expect(mapper.toFailure(Object.assign(new Error("down"), { code: "ECONNREFUSED" }))).toBeInstanceOf(
			UnavailableFailure,
		);
	});

	it("reads the status out of the nested error the API returns", () => {
		const failure = mapper.toFailure({ error: { code: 503, message: "overloaded" } });

		expect(failure).toBeInstanceOf(UnavailableFailure);
	});

	it("leaves an unrecognised error unknown, and unknown is not transient", () => {
		const failure = mapper.toFailure(new ApiError("something else", 418));

		expect(failure).toBeInstanceOf(UnknownFailure);
		expect(failure.isTransient).toBe(false);
	});

	it("keeps the provider message and the original error", () => {
		const raw = new ApiError("quota exceeded", 429);

		const failure = mapper.toFailure(raw);

		expect(failure.message).toBe("quota exceeded");
		expect(failure.cause).toBe(raw);
	});

	it("survives an error that is not an Error at all", () => {
		expect(mapper.toFailure("boom").message).toBe("boom");
		expect(mapper.toFailure(undefined).message).toContain("without a message");
	});
});
