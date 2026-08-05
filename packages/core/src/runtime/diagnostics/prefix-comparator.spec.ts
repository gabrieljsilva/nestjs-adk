import { describe, expect, it } from "vitest";
import { AgentName } from "../../domain/agent/agent-name";
import { ContextSegment } from "../../domain/diagnostics/context-segment";
import { ContextSnapshot } from "../../domain/diagnostics/context-snapshot";
import { ModelIdentity } from "../../domain/model/model-identity";
import { PrefixComparator } from "./prefix-comparator";

const SUPPORT = AgentName.from("support");
const MODEL = ModelIdentity.of("acme", "primary");

function snapshotOf(instructions: string, tools: string, conversation: string): ContextSnapshot {
	return new ContextSnapshot(SUPPORT, MODEL, [
		new ContextSegment(ContextSegment.INSTRUCTIONS, instructions),
		new ContextSegment(ContextSegment.TOOLS, tools),
		new ContextSegment(ContextSegment.CONVERSATION, conversation),
	]);
}

describe("PrefixComparator", () => {
	it("reports a whole shared prefix when two runs sent the same thing", () => {
		const report = new PrefixComparator().compare([
			snapshotOf("be brief", "[]", "hi"),
			snapshotOf("be brief", "[]", "hi"),
		]);

		expect(report.ratio).toBe(1);
		expect(report.isIdentical).toBe(true);
	});

	it("names the section where two runs stopped agreeing", () => {
		const report = new PrefixComparator().compare([
			snapshotOf("be brief at 10:00", "[]", "hi"),
			snapshotOf("be brief at 11:00", "[]", "hi"),
		]);

		expect(report.divergence?.segment).toBe("instructions");
		expect(report.isIdentical).toBe(false);
	});

	it("finds a divergence in the conversation after an identical prefix", () => {
		const report = new PrefixComparator().compare([
			snapshotOf("be brief", "[]", "hello"),
			snapshotOf("be brief", "[]", "howdy"),
		]);

		expect(report.divergence?.segment).toBe("conversation");
		expect(report.divergence?.excerpts).toEqual(["ello", "owdy"]);
	});

	it("measures against the largest context, so the longer run's cost is the one reported", () => {
		const report = new PrefixComparator().compare([
			snapshotOf("be brief", "[]", ""),
			snapshotOf("be brief", "[]", "a lot more text"),
		]);

		expect(report.prefixCharacters).toBe(10);
		expect(report.totalCharacters).toBe(25);
	});

	it("calls a single snapshot entirely its own prefix, because there is nothing to differ from", () => {
		const report = new PrefixComparator().compare([snapshotOf("be brief", "[]", "hi")]);

		expect(report.isIdentical).toBe(true);
		expect(report.ratio).toBe(1);
	});
});
