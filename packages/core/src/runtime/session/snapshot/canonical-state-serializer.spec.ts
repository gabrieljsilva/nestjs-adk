import { describe, expect, it } from "vitest";
import { SessionRevision } from "../../../common/revision/session-revision";
import { AgentName } from "../../../domain/agent/agent-name";
import { SessionState } from "../../../domain/session/session-state";
import { StateValues } from "../../../domain/session/state-values";
import { CanonicalStateSerializer } from "./canonical-state-serializer";

const serializer = new CanonicalStateSerializer();

describe("CanonicalStateSerializer", () => {
	it("renders the same text for states built in different orders", () => {
		const one = SessionState.initial().withValues(StateValues.empty().with("b", "2").with("a", "1"));
		const other = SessionState.initial().withValues(StateValues.empty().with("a", "1").with("b", "2"));

		expect(serializer.serialize(one)).toBe(serializer.serialize(other));
	});

	it("omits the active agent instead of writing it as null", () => {
		expect(serializer.serialize(SessionState.initial())).not.toContain("activeAgent");
	});

	it("includes the active agent when there is one", () => {
		const state = SessionState.initial().withActiveAgent(AgentName.from("support"));

		expect(serializer.serialize(state)).toContain("support");
	});

	it("separates states that differ only by revision", () => {
		const first = SessionState.initial();
		const second = first.at(SessionRevision.of(1));

		expect(serializer.serialize(first)).not.toBe(serializer.serialize(second));
	});

	it("separates states that differ only by a value", () => {
		const base = SessionState.initial();

		expect(serializer.serialize(base.withValues(StateValues.of([["k", "1"]])))).not.toBe(
			serializer.serialize(base.withValues(StateValues.of([["k", "2"]]))),
		);
	});

	it("is stable across repeated calls on the same state", () => {
		const state = SessionState.initial().withValues(StateValues.of([["k", "v"]]));

		expect(serializer.serialize(state)).toBe(serializer.serialize(state));
	});
});
