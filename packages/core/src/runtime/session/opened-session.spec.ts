import { describe, expect, it } from "vitest";
import { SessionId } from "../../common/identity/session-id";
import { Instant } from "../../common/time/instant";
import { AgentName } from "../../domain/agent/agent-name";
import { Session } from "../../domain/session/session";
import { SessionMode } from "../../domain/session/session-mode";
import { SessionState } from "../../domain/session/session-state";
import { OpenedSession } from "./opened-session";

const session = Session.start(
	SessionId.from("s-1"),
	AgentName.from("support"),
	SessionMode.EPHEMERAL,
	Instant.fromIso("2026-01-01T00:00:00.000Z"),
);

describe("OpenedSession", () => {
	it("carries the session with the state its journal implies", () => {
		const opened = new OpenedSession(session, SessionState.initial(), true);

		expect(opened.session.id.value).toBe("s-1");
		expect(opened.state.revision.value).toBe(0);
	});

	it("says whether the session was created by this command", () => {
		expect(new OpenedSession(session, SessionState.initial(), true).isNew).toBe(true);
		expect(new OpenedSession(session, SessionState.initial(), false).isNew).toBe(false);
	});
});
