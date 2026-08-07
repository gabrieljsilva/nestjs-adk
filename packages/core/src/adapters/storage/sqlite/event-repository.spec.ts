import { describe, expect, it } from "vitest";
import { AgentId } from "../../../common/identity/agent-id";
import { AgentRunId } from "../../../common/identity/agent-run-id";
import { CorrelationId } from "../../../common/identity/correlation-id";
import { EventId } from "../../../common/identity/event-id";
import { SessionId } from "../../../common/identity/session-id";
import { SessionRevision } from "../../../common/revision/session-revision";
import { Instant } from "../../../common/time/instant";
import { AgentName } from "../../../domain/agent/agent-name";
import { SessionCreated } from "../../../domain/event/catalog/session-created";
import { UserMessageReceived } from "../../../domain/event/catalog/user-message-received";
import { EventCorrelation } from "../../../domain/event/event-correlation";
import { EventHeader } from "../../../domain/event/event-header";
import { JournalCodec } from "../codec/journal-codec";
import { EventRepository } from "./event-repository";
import { SqliteConnection } from "./sqlite-connection";

const ID = SessionId.from("s-1");
const NOW = Instant.fromIso("2026-01-01T00:00:00.000Z");

function header(id: string, causedBy?: string): EventHeader {
	return new EventHeader(
		EventId.from(id),
		NOW,
		new EventCorrelation(
			AgentRunId.from("r-1"),
			AgentId.from("a-1"),
			CorrelationId.from("c-1"),
			causedBy === undefined ? undefined : EventId.from(causedBy),
		),
	);
}

function repository(): EventRepository {
	return new EventRepository(new SqliteConnection(), new JournalCodec());
}

describe("EventRepository", () => {
	it("reads an event back as the class that was written", () => {
		const events = repository();
		events.append(ID, SessionRevision.of(1), new UserMessageReceived(header("e-1"), "hello"));

		const [stored] = events.after(ID, SessionRevision.initial());

		expect(stored?.event).toBeInstanceOf(UserMessageReceived);
		expect(stored?.revision.value).toBe(1);
	});

	it("keeps the correlation a run stamped on the event", () => {
		const events = repository();
		events.append(ID, SessionRevision.of(1), new UserMessageReceived(header("e-1", "e-0"), "hello"));

		const [stored] = events.after(ID, SessionRevision.initial());

		expect(stored?.event.correlation.runId.value).toBe("r-1");
		expect(stored?.event.correlation.causationId?.value).toBe("e-0");
	});

	it("reads only what comes after the revision it was asked about, in order", () => {
		const events = repository();
		events.append(ID, SessionRevision.of(1), new UserMessageReceived(header("e-1"), "one"));
		events.append(ID, SessionRevision.of(2), new UserMessageReceived(header("e-2"), "two"));
		events.append(ID, SessionRevision.of(3), new UserMessageReceived(header("e-3"), "three"));

		expect(events.after(ID, SessionRevision.of(1)).map((stored) => stored.revision.value)).toEqual([2, 3]);
	});

	it("finds what was written under a set of event ids", () => {
		const events = repository();
		events.append(ID, SessionRevision.of(1), new UserMessageReceived(header("e-1"), "one"));

		expect(events.byIds(ID, ["e-1"])).toHaveLength(1);
		expect(events.byIds(ID, ["e-9"])).toHaveLength(0);
		expect(events.byIds(ID, [])).toHaveLength(0);
	});

	it("fingerprints content, so the same id carrying something else is not a retry", () => {
		const events = repository();
		const first = new SessionCreated(header("e-1"), AgentName.from("support"), undefined);
		const other = new SessionCreated(header("e-1"), AgentName.from("billing"), undefined);
		events.append(ID, SessionRevision.of(1), first);

		const written = events.writtenPayloads(ID, ["e-1"]);

		expect(written.get("e-1")).toBe(events.fingerprintOf(first));
		expect(written.get("e-1")).not.toBe(events.fingerprintOf(other));
	});

	it("forgets the whole journal of a session it was told to clear", () => {
		const events = repository();
		events.append(ID, SessionRevision.of(1), new UserMessageReceived(header("e-1"), "one"));

		events.deleteAll(ID);

		expect(events.after(ID, SessionRevision.initial())).toEqual([]);
	});
});
