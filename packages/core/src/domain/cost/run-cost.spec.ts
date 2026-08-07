import { describe, expect, it } from "vitest";
import { ModelIdentity } from "../model/model-identity";
import { ModelUsage } from "../model/model-usage";
import { CostBreakdown } from "./cost-breakdown";
import { ModelCost } from "./model-cost";
import { ModelUnpriced } from "./model-unpriced";
import { RunCost } from "./run-cost";
import { UsdAmount } from "./usd-amount";

const LUNA = ModelIdentity.of("openai", "gpt-5.6-luna");
const FLASH = ModelIdentity.of("google", "gemini-3.5-flash-lite");

function breakdown(input: bigint, output: bigint, cached = 0n): CostBreakdown {
	return CostBreakdown.of(UsdAmount.ofPico(input), UsdAmount.ofPico(output), UsdAmount.ofPico(cached));
}

describe("CostBreakdown", () => {
	it("totals the three parts it was charged for", () => {
		expect(breakdown(100n, 20n, 3n).total.pico).toBe(123n);
	});

	it("adds part by part, so a column stays a column", () => {
		const sum = breakdown(100n, 20n, 3n).plus(breakdown(1n, 2n, 4n));

		expect(sum.input.pico).toBe(101n);
		expect(sum.output.pico).toBe(22n);
		expect(sum.cached.pico).toBe(7n);
	});

	it("starts at nothing", () => {
		expect(CostBreakdown.zero().total.isZero).toBe(true);
	});
});

describe("ModelCost", () => {
	it("counts the calls it served and sums what they cost", () => {
		const cost = ModelCost.none(LUNA)
			.including(ModelUsage.of(40, 12), breakdown(100n, 20n))
			.including(ModelUsage.of(10, 2), breakdown(50n, 10n));

		expect(cost.calls).toBe(2);
		expect(cost.amount.pico).toBe(180n);
	});

	/** A ledger row cannot be checked against an invoice without the tokens behind the amount. */
	it("sums the tokens next to the money", () => {
		const cost = ModelCost.none(LUNA)
			.including(ModelUsage.of(40, 12), breakdown(100n, 20n))
			.including(ModelUsage.of(10, 2), breakdown(50n, 10n));

		expect(cost.usage.inputTokens).toBe(50);
		expect(cost.usage.outputTokens).toBe(14);
	});

	it("starts with no call, no tokens and no money", () => {
		const cost = ModelCost.none(LUNA);

		expect(cost.calls).toBe(0);
		expect(cost.usage.totalTokens).toBe(0);
		expect(cost.amount.isZero).toBe(true);
	});
});

describe("RunCost", () => {
	it("totals every model that was priced", () => {
		const cost = RunCost.of([
			ModelCost.of(LUNA, 2, ModelUsage.of(40, 12), breakdown(100n, 20n)),
			ModelCost.of(FLASH, 1, ModelUsage.of(10, 2), breakdown(7n, 1n)),
		]);

		expect(cost.total.pico).toBe(128n);
		expect(cost.calls).toBe(3);
	});

	/** The rule that makes the number safe to read: what could not be priced is named, not zeroed into the total. */
	it("leaves an unpriced model out of the total and says so", () => {
		const cost = RunCost.of([ModelCost.of(LUNA, 1, ModelUsage.of(40, 12), breakdown(100n, 20n))], [FLASH]);

		expect(cost.total.pico).toBe(120n);
		expect(cost.unpriced).toEqual([FLASH]);
		expect(cost.isComplete).toBe(false);
	});

	it("answers zero rather than nothing when there was no source", () => {
		const cost = RunCost.nothing([LUNA]);

		expect(cost.total.isZero).toBe(true);
		expect(cost.byModel).toEqual([]);
		expect(cost.isComplete).toBe(false);
	});

	/** A controller that answers with an `AgentResult` serializes this, and a bigint would throw. */
	it("serializes to a total a client can read, without a bigint in sight", () => {
		const cost = RunCost.of([ModelCost.of(LUNA, 2, ModelUsage.of(40, 12), breakdown(4_000_000n, 4_800_000n))], [FLASH]);

		const serialized = JSON.parse(JSON.stringify(cost));

		expect(serialized.total).toBe("0.0000088");
		expect(serialized.calls).toBe(2);
		expect(serialized.isComplete).toBe(false);
		expect(serialized.unpriced).toEqual([FLASH.toString()]);
		expect(JSON.stringify(cost)).not.toContain("pico");
	});

	it("is complete when every call was priced", () => {
		expect(RunCost.of([ModelCost.of(LUNA, 1, ModelUsage.of(1, 1), breakdown(1n, 1n))]).isComplete).toBe(true);
		expect(RunCost.nothing().isComplete).toBe(true);
	});
});

describe("ModelUnpriced", () => {
	it("says which model, how many tokens went uncounted, and why", () => {
		const notice = new ModelUnpriced(FLASH, "unknown-model", 52);

		expect(notice.message).toContain("google/gemini-3.5-flash-lite");
		expect(notice.message).toContain("52");
		expect(notice.message).toContain("unknown-model");
	});
});
