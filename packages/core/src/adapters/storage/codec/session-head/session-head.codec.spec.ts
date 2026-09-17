import { describe, expect, it } from "vitest";
import { SessionId } from "../../../../common/identity/session-id.value-object";
import { SessionRevision } from "../../../../common/revision/session-revision.value-object";
import { Instant } from "../../../../common/time/instant.value-object";
import { AgentName } from "../../../../domain/agent/agent-name.value-object";
import { SessionStatus } from "../../../../domain/session/session-status.value-object";
import { Session } from "../../../../domain/session/session.entity";
import { UnreadableStoredValueError } from "../errors/unreadable-stored-value.error";
import { SessionHeadCodec } from "./session-head.codec";

const CREATED_AT = "2026-01-01T00:00:00.000Z";
const UPDATED_AT = "2026-01-02T00:00:00.000Z";

function suspended(): Session {
	return Session.restore(
		SessionId.from("s-1"),
		AgentName.from("support"),
		SessionStatus.SUSPENDED,
		new SessionRevision(7),
		Instant.fromIso(CREATED_AT),
		Instant.fromIso(UPDATED_AT),
	);
}

/**
 * The head of a conversation as a row, which is the piece nobody could write from outside:
 * `Session.restore` asks for a `SessionStatus` and a table only ever has the word.
 */
describe("SessionHeadCodec", () => {
	it("encodes a session as the columns its table is made of", () => {
		const record = new SessionHeadCodec().encode(suspended());

		expect(record).toEqual({
			id: "s-1",
			rootAgent: "support",
			status: "suspended",
			revision: 7,
			createdAt: CREATED_AT,
			updatedAt: UPDATED_AT,
		});
	});

	it("brings back a session that means the same thing", () => {
		const codec = new SessionHeadCodec();
		const session = suspended();

		expect(codec.decode(codec.encode(session))).toEqual(session);
	});

	/** Identity is what `acceptsCommands` compares on, so a copy of the status would not do. */
	it("decodes the status as the one instance the runtime decides on", () => {
		const codec = new SessionHeadCodec();

		const decoded = codec.decode(codec.encode(suspended()));

		expect(decoded.status).toBe(SessionStatus.SUSPENDED);
	});

	/** A row written before the head stopped carrying an owner still has the column, and it is ignored. */
	it("ignores a column no session means anything by anymore", () => {
		const decoded = new SessionHeadCodec().decode({
			id: "s-2",
			rootAgent: "support",
			status: "active",
			revision: 0,
			createdAt: CREATED_AT,
			updatedAt: CREATED_AT,
			owner: "u-1",
		});

		expect(decoded.id.value).toBe("s-2");
	});

	it("decodes a plain row an adapter read out of its own table", () => {
		const decoded = new SessionHeadCodec().decode({
			id: "s-3",
			rootAgent: "billing",
			status: "active",
			revision: 2,
			createdAt: CREATED_AT,
			updatedAt: UPDATED_AT,
			owner: "u-2",
		});

		expect(decoded.id.value).toBe("s-3");
		expect(decoded.revision.value).toBe(2);
	});

	/** A row written by a newer build, which is worth saying out loud. */
	it("refuses a status this runtime does not know", () => {
		const codec = new SessionHeadCodec();
		const row = { ...codec.encode(suspended()), status: "hibernating" };

		expect(() => codec.decode(row)).toThrow(UnreadableStoredValueError);
	});
});
