import { describe, expect, it } from "vitest";
import { SessionRevision } from "../../common/revision/session-revision";
import { AgentName } from "../agent/agent-name";
import { SessionState } from "./session-state";
import { StateValues } from "./state-values";

describe("SessionState", () => {
	it("starts at revision zero with no values and no active agent", () => {
		const state = SessionState.initial();

		expect(state.revision.value).toBe(0);
		expect(state.values.size).toBe(0);
		expect(state.activeAgent).toBeUndefined();
	});

	it("restores the revision, values and active agent it was given", () => {
		const state = SessionState.restored(
			SessionRevision.of(7),
			StateValues.of([["plan", "premium"]]),
			AgentName.from("support"),
		);

		expect(state.revision.value).toBe(7);
		expect(state.values.get("plan")).toBe("premium");
		expect(state.activeAgent?.value).toBe("support");
	});

	it("moves to a revision without touching the previous instance", () => {
		const before = SessionState.initial();
		const after = before.at(SessionRevision.of(3));

		expect(after.revision.value).toBe(3);
		expect(before.revision.value).toBe(0);
	});

	it("replaces values while keeping revision and active agent", () => {
		const state = SessionState.restored(SessionRevision.of(2), StateValues.empty(), AgentName.from("billing"));
		const next = state.withValues(StateValues.of([["k", "v"]]));

		expect(next.revision.value).toBe(2);
		expect(next.activeAgent?.value).toBe("billing");
		expect(next.values.get("k")).toBe("v");
		expect(state.values.size).toBe(0);
	});

	it("switches the active agent without losing values", () => {
		const state = SessionState.initial().withValues(StateValues.of([["k", "v"]]));
		const next = state.withActiveAgent(AgentName.from("risk"));

		expect(next.activeAgent?.value).toBe("risk");
		expect(next.values.get("k")).toBe("v");
		expect(state.activeAgent).toBeUndefined();
	});
});
