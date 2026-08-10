import { describe, expect, it } from "vitest";
import { SessionId } from "../../../common/identity/session-id";
import { SessionRevision } from "../../../common/revision/session-revision";
import { Instant } from "../../../common/time/instant";
import { AgentName } from "../../../domain/agent/agent-name";
import { Session } from "../../../domain/session/session";
import { SessionOwner } from "../../../domain/session/session-owner";
import { SessionHeadCodec } from "../codec/session-head-codec";
import { SessionRepository } from "./session-repository";
import { SqliteConnection } from "./sqlite-connection";

const ID = SessionId.from("s-1");
const NOW = Instant.fromIso("2026-01-01T00:00:00.000Z");

function repository(): SessionRepository {
	return new SessionRepository(new SqliteConnection(), new SessionHeadCodec());
}

describe("SessionRepository", () => {
	it("gives back the session it was given, as the same value", () => {
		const sessions = repository();
		sessions.insert(Session.start(ID, AgentName.from("support"), NOW));

		const found = sessions.find(ID);

		expect(found?.rootAgent.value).toBe("support");
		expect(found?.acceptsCommands).toBe(true);
		expect(found?.createdAt.toIso()).toBe(NOW.toIso());
	});

	it("keeps the owner a session was opened with", () => {
		const sessions = repository();
		const owner = SessionOwner.from("gabriel");
		sessions.insert(Session.start(ID, AgentName.from("support"), NOW, owner));

		expect(sessions.find(ID)?.owner?.value).toBe("gabriel");
	});

	it("finds nothing for a session that was never inserted", () => {
		expect(repository().find(ID)).toBeUndefined();
	});

	it("moves the revision without touching anything else", () => {
		const sessions = repository();
		const session = Session.start(ID, AgentName.from("support"), NOW);
		sessions.insert(session);

		sessions.advance(session.at(SessionRevision.of(4)));

		expect(sessions.find(ID)?.revision.value).toBe(4);
		expect(sessions.find(ID)?.rootAgent.value).toBe("support");
	});

	it("forgets a session it deleted", () => {
		const sessions = repository();
		sessions.insert(Session.start(ID, AgentName.from("support"), NOW));

		sessions.delete(ID);

		expect(sessions.find(ID)).toBeUndefined();
	});
});
