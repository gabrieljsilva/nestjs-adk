import { describe, expect, it } from "vitest";
import { AgentName } from "../../domain/agent/agent-name";
import { ContextSegment } from "../../domain/diagnostics/context-segment";
import { ContextSnapshot } from "../../domain/diagnostics/context-snapshot";
import { ModelIdentity } from "../../domain/model/model-identity";
import { ContextCapture } from "./context-capture";

describe("ContextCapture", () => {
	it("is a dependency a run is handed, not a place a run looks up", () => {
		class Collecting extends ContextCapture {
			public readonly seen: ContextSnapshot[] = [];

			public capture(snapshot: ContextSnapshot): void {
				this.seen.push(snapshot);
			}
		}
		const capture = new Collecting();

		capture.capture(
			new ContextSnapshot(AgentName.from("support"), ModelIdentity.of("acme", "primary"), [
				new ContextSegment(ContextSegment.INSTRUCTIONS, "Be brief."),
			]),
		);

		expect(capture.seen).toHaveLength(1);
		expect(capture).toBeInstanceOf(ContextCapture);
	});
});
