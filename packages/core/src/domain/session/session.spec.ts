import { describe, expect, it } from "vitest";
import { SessionId } from "../../common/identity/session-id";
import { SessionRevision } from "../../common/revision/session-revision";
import { Instant } from "../../common/time/instant";
import { AgentName } from "../agent/agent-name";
import { InvertedSessionTimestampsError } from "./errors/inverted-session-timestamps.error";
import { Session } from "./session";
import { SessionOwner } from "./session-owner";
import { SessionStatus } from "./session-status";

const ID = SessionId.from("s-1");
const SUPPORT = AgentName.from("support");
const CREATED = Instant.fromIso("2026-01-01T00:00:00.000Z");
const LATER = Instant.fromIso("2026-01-02T00:00:00.000Z");

describe("Session start", () => {
	it("begins active, at the beginning of its journal, unchanged since it was created", () => {
		const session = Session.start(ID, SUPPORT, CREATED);

		expect(session.status).toBe(SessionStatus.ACTIVE);
		expect(session.revision.value).toBe(0);
		expect(session.createdAt.toIso()).toBe(CREATED.toIso());
		expect(session.updatedAt.toIso()).toBe(CREATED.toIso());
		expect(session.acceptsCommands).toBe(true);
	});

	/** The identifier is what finds a conversation again, so nothing here needs an owner. */
	it("opens without an owner, and opens with one when the application named it", () => {
		expect(Session.start(ID, SUPPORT, CREATED).owner).toBeUndefined();
		expect(Session.start(ID, SUPPORT, CREATED, SessionOwner.from("gabriel")).owner?.value).toBe("gabriel");
	});
});

describe("Session restore", () => {
	it("brings back every part it was given", () => {
		const session = Session.restore(
			ID,
			SUPPORT,
			SessionStatus.SUSPENDED,
			SessionRevision.of(7),
			CREATED,
			LATER,
			SessionOwner.from("gabriel"),
		);

		expect(session.status).toBe(SessionStatus.SUSPENDED);
		expect(session.revision.value).toBe(7);
		expect(session.updatedAt.toIso()).toBe(LATER.toIso());
		expect(session.owner?.value).toBe("gabriel");
	});

	/** A row saying it changed before it existed is a corrupt row, not a session. */
	it("refuses a row that was updated before it was created", () => {
		expect(() => Session.restore(ID, SUPPORT, SessionStatus.ACTIVE, SessionRevision.of(1), LATER, CREATED)).toThrow(
			InvertedSessionTimestampsError,
		);
	});

	it("accepts a row never touched since it was created", () => {
		const session = Session.restore(ID, SUPPORT, SessionStatus.ACTIVE, SessionRevision.initial(), CREATED, CREATED);

		expect(session.revision.value).toBe(0);
	});
});

describe("Session copies", () => {
	it("moves the revision and the moment it moved, keeping everything else", () => {
		const advanced = Session.start(ID, SUPPORT, CREATED, SessionOwner.from("gabriel")).at(SessionRevision.of(3), LATER);

		expect(advanced.revision.value).toBe(3);
		expect(advanced.updatedAt.toIso()).toBe(LATER.toIso());
		expect(advanced.createdAt.toIso()).toBe(CREATED.toIso());
		expect(advanced.owner?.value).toBe("gabriel");
		expect(advanced.status).toBe(SessionStatus.ACTIVE);
	});

	it("keeps the moment of the last change when the caller names none", () => {
		const advanced = Session.start(ID, SUPPORT, CREATED).at(SessionRevision.of(1));

		expect(advanced.updatedAt.toIso()).toBe(CREATED.toIso());
	});

	it("changes the status without touching the journal it stands on", () => {
		const closed = Session.start(ID, SUPPORT, CREATED).at(SessionRevision.of(2), LATER).withStatus(SessionStatus.CLOSED);

		expect(closed.status).toBe(SessionStatus.CLOSED);
		expect(closed.acceptsCommands).toBe(false);
		expect(closed.revision.value).toBe(2);
		expect(closed.updatedAt.toIso()).toBe(LATER.toIso());
	});
});
