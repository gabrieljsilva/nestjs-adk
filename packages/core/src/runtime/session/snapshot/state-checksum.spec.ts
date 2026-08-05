import { describe, expect, it } from "vitest";
import { SessionId } from "../../../common/identity/session-id";
import { SessionRevision } from "../../../common/revision/session-revision";
import { SessionState } from "../../../domain/session/session-state";
import { StateValues } from "../../../domain/session/state-values";
import { StateChecksum } from "./state-checksum";

const checksum = new StateChecksum();
const session = SessionId.from("s-1");
const VERSION = 1;

describe("StateChecksum", () => {
	it("gives the same digest for the same session, version and state", () => {
		const state = SessionState.initial().withValues(StateValues.of([["k", "v"]]));

		expect(checksum.of(session, VERSION, state).equals(checksum.of(session, VERSION, state))).toBe(true);
	});

	it("changes when the state changes", () => {
		const first = checksum.of(session, VERSION, SessionState.initial());
		const second = checksum.of(session, VERSION, SessionState.initial().at(SessionRevision.of(1)));

		expect(first.equals(second)).toBe(false);
	});

	it("changes when the projector version changes", () => {
		const state = SessionState.initial();

		expect(checksum.of(session, 1, state).equals(checksum.of(session, 2, state))).toBe(false);
	});

	it("changes when the session changes, so a snapshot cannot be restored elsewhere", () => {
		const state = SessionState.initial();

		expect(checksum.of(session, VERSION, state).equals(checksum.of(SessionId.from("s-2"), VERSION, state))).toBe(false);
	});

	it("declares the algorithm it used", () => {
		expect(checksum.of(session, VERSION, SessionState.initial()).algorithm).toBe("sha256");
	});

	it("ignores the order values were inserted in", () => {
		const one = SessionState.initial().withValues(StateValues.empty().with("b", "2").with("a", "1"));
		const other = SessionState.initial().withValues(StateValues.empty().with("a", "1").with("b", "2"));

		expect(checksum.of(session, VERSION, one).equals(checksum.of(session, VERSION, other))).toBe(true);
	});
});
