import { describe, expect, it } from "vitest";
import { CompactionDecision } from "./compaction-decision";

describe("CompactionDecision", () => {
	it("skips while keeping everything", () => {
		const decision = CompactionDecision.skip();

		expect(decision.shouldCompact).toBe(false);
		expect(decision.targetShare).toBe(1);
	});

	it("carries the share to keep and how many recent blocks to protect", () => {
		const decision = CompactionDecision.keepShare(0.6, 4);

		expect(decision.shouldCompact).toBe(true);
		expect(decision.targetShare).toBe(0.6);
		expect(decision.keepRecentBlocks).toBe(4);
	});

	it("translates the share into a size, given what the prompt measures now", () => {
		expect(CompactionDecision.keepShare(0.6, 2).targetOf(1000)).toBe(600);
	});

	it("clamps a share nobody could honour", () => {
		expect(CompactionDecision.keepShare(2, 0).targetShare).toBe(1);
		expect(CompactionDecision.keepShare(-1, 0).targetShare).toBe(0);
	});

	it("refuses a negative count of protected blocks", () => {
		expect(CompactionDecision.keepShare(0.5, -3).keepRecentBlocks).toBe(0);
	});
});
