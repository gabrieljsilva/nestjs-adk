import {
	AgentResult,
	AgentRunId,
	AgentRunStatus,
	CostBreakdown,
	ModelCost,
	ModelIdentity,
	ModelUsage,
	RunCost,
	SessionId,
	UsdAmount,
} from "@nestjs-adk/core";
import { describe, expect, it } from "vitest";
import { RecordedRun } from "./recorded-run";
import { RunEvents } from "./run-events";

const LUNA = ModelIdentity.of("openai", "gpt-5.6-luna");

function costOf(pico: bigint): RunCost {
	return RunCost.of([
		ModelCost.of(LUNA, 1, ModelUsage.of(40, 12), CostBreakdown.of(UsdAmount.ofPico(pico), UsdAmount.zero())),
	]);
}

function recorded(result: AgentResult): RecordedRun {
	return new RecordedRun(result, RunEvents.of([]));
}

describe("RecordedRun", () => {
	/**
	 * It rebuilds the result rather than wrapping it, so every field has to be named here.
	 * A field added to `AgentResult` and forgotten in this constructor reads as absent in every
	 * test, which is the kind of gap a suite cannot see: the run is green and the value is gone.
	 */
	it("carries the cost the run answered", () => {
		const result = new AgentResult(
			SessionId.from("s-1"),
			AgentRunId.from("r-1"),
			AgentRunStatus.COMPLETED,
			"done",
			[],
			costOf(8_800_000n),
		);

		const run = recorded(result);

		expect(run.cost.total.pico).toBe(8_800_000n);
		expect(run.cost.isComplete).toBe(true);
		expect(run.cost.byModel[0]?.model.toString()).toBe(LUNA.toString());
	});

	it("carries a zeroed cost for a runtime that priced nothing", () => {
		const result = new AgentResult(SessionId.from("s-1"), AgentRunId.from("r-1"), AgentRunStatus.COMPLETED, "done");

		expect(recorded(result).cost.total.isZero).toBe(true);
	});

	it("is the result a service reads, with the evidence a test needs alongside it", () => {
		const run = recorded(
			new AgentResult(SessionId.from("s-2"), AgentRunId.from("r-2"), AgentRunStatus.COMPLETED, "shipped"),
		);

		expect(run).toBeInstanceOf(AgentResult);
		expect(run.text).toBe("shipped");
		expect(run.toolsRun).toEqual([]);
	});
});
