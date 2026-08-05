import { describe, expect, it } from "vitest";
import { AgentName } from "../../domain/agent/agent-name";
import { ContextSegment } from "../../domain/diagnostics/context-segment";
import { ContextSnapshot } from "../../domain/diagnostics/context-snapshot";
import { ModelIdentity } from "../../domain/model/model-identity";
import { CapturedContexts } from "./captured-contexts";

function snapshotOf(text: string): ContextSnapshot {
	return new ContextSnapshot(AgentName.from("support"), ModelIdentity.of("acme", "primary"), [
		new ContextSegment(ContextSegment.CONVERSATION, text),
	]);
}

describe("CapturedContexts", () => {
	it("keeps the order the run produced them in", () => {
		const captured = new CapturedContexts();
		captured.capture(snapshotOf("first"));
		captured.capture(snapshotOf("second"));

		expect(captured.all.map((snapshot) => snapshot.text)).toEqual(["first", "second"]);
		expect(captured.size).toBe(2);
	});

	it("hands back a copy, so a caller cannot change what a run recorded", () => {
		const captured = new CapturedContexts();
		captured.capture(snapshotOf("only"));

		const taken = [...captured.all];
		taken.pop();

		expect(captured.size).toBe(1);
	});

	it("captures nothing for a run that produced nothing", () => {
		expect(new CapturedContexts().all).toEqual([]);
	});
});
