import type { ContextSnapshot } from "./context-types";
import { comparePrefix } from "./prefix-compare";

function snapshot(instruction: string, tools: string, contents: string, agent = "support"): ContextSnapshot {
	return {
		agent,
		segments: [
			{ kind: "systemInstruction", text: instruction },
			{ kind: "toolDeclarations", text: tools },
			{ kind: "contents", text: contents },
		],
	};
}

describe("comparePrefix", () => {
	it("reports the volatile tail only: identical prompt and tools, different user message", () => {
		const report = comparePrefix([
			snapshot("You are support.", "[get_order]", "what is my balance?"),
			snapshot("You are support.", "[get_order]", "I want to cancel"),
		]);

		expect(report.prefixChars).toBe("You are support.[get_order]".length);
		expect(report.divergesAt?.segment).toBe("contents");
		expect(report.divergesAt?.segmentOffset).toBe(0);
	});

	it("locates a volatile value inside the system instruction", () => {
		const report = comparePrefix([
			snapshot("You are support. Now: 2026-07-26T10:00.", "[t]", "hi"),
			snapshot("You are support. Now: 2026-07-26T18:30.", "[t]", "hi"),
		]);

		expect(report.divergesAt?.segment).toBe("systemInstruction");
		expect(report.divergesAt?.segmentOffset).toBe("You are support. Now: 2026-07-26T1".length);
		expect(report.divergesAt?.excerpts[0]).toContain("0:00");
		expect(report.divergesAt?.excerpts[1]).toContain("8:30");
	});

	it("locates an unstable tool catalog in the tool declarations", () => {
		const report = comparePrefix([
			snapshot("You are support.", "[get_order,refund]", "hi"),
			snapshot("You are support.", "[refund,get_order]", "hi"),
		]);

		expect(report.divergesAt?.segment).toBe("toolDeclarations");
		expect(report.ratio).toBeLessThan(1);
	});

	it("byte-identical contexts have no divergence and full ratio", () => {
		const report = comparePrefix([snapshot("Same.", "[t]", "hi"), snapshot("Same.", "[t]", "hi")]);

		expect(report.ratio).toBe(1);
		expect(report.divergesAt).toBeUndefined();
	});

	it("contexts differing from the first character have a zero prefix", () => {
		const report = comparePrefix([snapshot("Alpha agent.", "[]", ""), snapshot("Beta agent.", "[]", "")]);

		expect(report.prefixChars).toBe(0);
		expect(report.ratio).toBe(0);
		expect(report.divergesAt?.segment).toBe("systemInstruction");
		expect(report.divergesAt?.offset).toBe(0);
	});

	it("denominator is the LARGEST context: the worst case the bigger run pays", () => {
		const short = snapshot("Prompt.", "", "hi");
		const long = snapshot("Prompt.", "", "a much, much longer question from the user");
		const report = comparePrefix([short, long]);

		expect(report.totalChars).toBe("Prompt.".length + "a much, much longer question from the user".length);
		expect(report.prefixChars).toBe("Prompt.".length);
		expect(report.ratio).toBeCloseTo(report.prefixChars / report.totalChars, 10);
	});

	it("one context being a prefix of the other still counts as divergence", () => {
		const report = comparePrefix([snapshot("Prompt.", "", ""), snapshot("Prompt.", "", " and more")]);

		expect(report.prefixChars).toBe("Prompt.".length);
		expect(report.divergesAt?.segment).toBe("contents");
		expect(report.divergesAt?.excerpts[0]).toBe("");
		expect(report.divergesAt?.excerpts[1]).toBe(" and more");
	});

	it("compares more than two runs, taking the prefix common to ALL of them", () => {
		const report = comparePrefix([
			snapshot("Shared prompt.", "", "a"),
			snapshot("Shared prompt.", "", "b"),
			snapshot("Shared prompX.", "", "c"),
		]);

		expect(report.prefixChars).toBe("Shared promp".length);
	});

	it("an agent with no tools and no skills is still measured, with no artificial merit", () => {
		const bare = (message: string): ContextSnapshot => ({
			agent: "bare",
			segments: [
				{ kind: "systemInstruction", text: "" },
				{ kind: "toolDeclarations", text: "" },
				{ kind: "contents", text: message },
			],
		});
		const report = comparePrefix([bare("hello"), bare("goodbye")]);

		expect(report.prefixChars).toBe(0);
		expect(report.totalChars).toBe("goodbye".length);
	});

	it("empty contexts on both sides count as stable instead of dividing by zero", () => {
		const empty: ContextSnapshot = { agent: "x", segments: [] };
		const report = comparePrefix([empty, empty]);

		expect(report.ratio).toBe(1);
		expect(report.totalChars).toBe(0);
	});

	it("refuses to compare fewer than two snapshots", () => {
		expect(() => comparePrefix([snapshot("a", "", "")])).toThrow(/at least 2 snapshots/);
	});
});
