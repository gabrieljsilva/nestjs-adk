import { describe, expect, it } from "vitest";
import { SessionId } from "../../common/identity/session-id.value-object";
import { Instant } from "../../common/time/instant.value-object";
import { AgentName } from "../../domain/agent/agent-name.value-object";
import { Session } from "../../domain/session/session.entity";
import { SessionState } from "../../domain/session/state/session-state.value-object";
import { OpenedSession } from "./opened-session.value-object";

const session = Session.start(
	SessionId.from("s-1"),
	AgentName.from("support"),
	Instant.fromIso("2026-01-01T00:00:00.000Z"),
);

describe("OpenedSession", () => {
	it("carries the session with the state its journal implies", () => {
		const opened = new OpenedSession(session, SessionState.initial(), true);

		expect(opened.session.id.value).toBe("s-1");
		expect(opened.state.revision.value).toBe(0);
	});

	it("says whether this run is the one that has to record the conversation beginning", () => {
		expect(new OpenedSession(session, SessionState.initial(), true).isNew).toBe(true);
		expect(new OpenedSession(session, SessionState.initial(), false).isNew).toBe(false);
	});
});
