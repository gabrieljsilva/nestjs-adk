import { describe, expect, it } from "vitest";
import { RunLimits } from "../../domain/session/run-limits";
import { ToolInvalidArgsError } from "../../domain/tool/errors/tool-invalid-args.error";
import { ToolRepeatedFailureError } from "../../domain/tool/errors/tool-repeated-failure.error";
import { ToolBreaker } from "./tool-breaker";

describe("ToolBreaker", () => {
	it("hands invalid arguments back until the declared limit, and then stops the run", () => {
		const breaker = new ToolBreaker(RunLimits.none());

		expect(() => breaker.recordInvalidArgs("refund", "orderId is required")).not.toThrow();
		expect(() => breaker.recordInvalidArgs("refund", "orderId is required")).toThrow(ToolInvalidArgsError);
	});

	it("defaults to two invalid tries, because the model usually fixes its own argument", () => {
		expect(RunLimits.none().invalidArgsLimit).toBe(2);
	});

	it("takes the limit an application chose instead", () => {
		const breaker = new ToolBreaker(RunLimits.of(undefined, undefined, 1));

		expect(() => breaker.recordInvalidArgs("refund", "bad")).toThrow(ToolInvalidArgsError);
	});

	it("never stops on failures when no limit was declared", () => {
		const breaker = new ToolBreaker(RunLimits.none());

		for (let attempt = 0; attempt < 50; attempt += 1) breaker.recordFailure("lookup", "connection refused");

		expect(breaker.failuresOf("lookup")).toBe(50);
	});

	it("stops the run once the same tool failed as many times as it was allowed", () => {
		const breaker = new ToolBreaker(RunLimits.of(undefined, 2));

		breaker.recordFailure("lookup", "connection refused");

		expect(() => breaker.recordFailure("lookup", "connection refused")).toThrow(ToolRepeatedFailureError);
	});

	it("forgets a streak the moment the tool works", () => {
		const breaker = new ToolBreaker(RunLimits.of(undefined, 2));
		breaker.recordFailure("lookup", "connection refused");

		breaker.recordSuccess("lookup");

		expect(breaker.failuresOf("lookup")).toBe(0);
		expect(() => breaker.recordFailure("lookup", "connection refused")).not.toThrow();
	});

	it("counts one tool apart from another", () => {
		const breaker = new ToolBreaker(RunLimits.of(undefined, 2));

		breaker.recordFailure("lookup", "boom");
		breaker.recordFailure("refund", "boom");

		expect(breaker.failuresOf("lookup")).toBe(1);
		expect(breaker.failuresOf("refund")).toBe(1);
	});

	it("clears the invalid streak on a valid call without touching the failure streak", () => {
		const breaker = new ToolBreaker(RunLimits.none());
		breaker.recordInvalidArgs("refund", "bad");
		breaker.recordFailure("refund", "boom");

		breaker.recordValidArgs("refund");

		expect(breaker.invalidArgsOf("refund")).toBe(0);
		expect(breaker.failuresOf("refund")).toBe(1);
	});
});
