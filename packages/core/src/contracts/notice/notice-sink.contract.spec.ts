import { describe, expect, it } from "vitest";
import { ContextNoticeSink } from "../context/context-notice-sink.contract";
import { ConsumerFailureSink } from "../events/consumer-failure-sink.contract";
import { PricingNoticeSink } from "../pricing/pricing-notice-sink.contract";
import { NoticeSink } from "./notice-sink.contract";

/**
 * One family, three notices. A sink written against one of them reads the same as a sink
 * written against another, which is the only reason to have a base at all.
 */
describe("NoticeSink", () => {
	it("is what every sink of the lib is", () => {
		expect(Object.getPrototypeOf(ContextNoticeSink)).toBe(NoticeSink);
		expect(Object.getPrototypeOf(ConsumerFailureSink)).toBe(NoticeSink);
		expect(Object.getPrototypeOf(PricingNoticeSink)).toBe(NoticeSink);
	});

	it("reports and answers nothing, because a sink is never on the path of a decision", () => {
		const reported: string[] = [];
		class RecordingSink extends NoticeSink<string> {
			public report(_context: undefined, notice: string): void {
				reported.push(notice);
			}
		}

		expect(new RecordingSink().report(undefined, "degraded")).toBeUndefined();
		expect(reported).toEqual(["degraded"]);
	});
});
