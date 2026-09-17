import { describe, expect, it } from "vitest";
import { InvalidDurationError } from "../errors/invalid-duration.error";
import { Duration } from "./duration.value-object";

describe("Duration", () => {
	it("keeps milliseconds as they were given", () => {
		expect(Duration.fromMillis(250).millis).toBe(250);
	});

	it("rounds seconds up, because waiting a moment longer is always safe", () => {
		expect(Duration.fromSeconds(1.2).millis).toBe(1200);
		expect(Duration.fromSeconds(0.0001).millis).toBe(1);
	});

	it("refuses a length that is not a whole non negative count of milliseconds", () => {
		expect(() => Duration.fromMillis(-1)).toThrow(InvalidDurationError);
		expect(() => Duration.fromMillis(1.5)).toThrow(InvalidDurationError);
		expect(() => Duration.fromSeconds(Number.NaN)).toThrow(InvalidDurationError);
	});

	it("answers the shorter of itself and a ceiling", () => {
		expect(Duration.fromMillis(900).cappedAt(Duration.fromMillis(500)).millis).toBe(500);
		expect(Duration.fromMillis(100).cappedAt(Duration.fromMillis(500)).millis).toBe(100);
	});

	it("says when it is zero and when it is longer than another", () => {
		expect(Duration.zero().isZero).toBe(true);
		expect(Duration.fromMillis(2).isLongerThan(Duration.fromMillis(1))).toBe(true);
		expect(Duration.fromMillis(1).isLongerThan(Duration.fromMillis(1))).toBe(false);
	});
});
