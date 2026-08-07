import { describe, expect, it } from "vitest";
import { SessionId } from "../../../common/identity/session-id";
import { SessionRevision } from "../../../common/revision/session-revision";
import { Instant } from "../../../common/time/instant";
import { AgentName } from "../../../domain/agent/agent-name";
import { Session } from "../../../domain/session/session";
import { SessionMode } from "../../../domain/session/session-mode";
import { SessionOwner } from "../../../domain/session/session-owner";
import { SessionStatus } from "../../../domain/session/session-status";
import { UnreadableStoredValueError } from "./errors/unreadable-stored-value.error";
import { SessionHeadCodec } from "./session-head-codec";

const CREATED_AT = "2026-01-01T00:00:00.000Z";
const UPDATED_AT = "2026-01-02T00:00:00.000Z";

function durable(): Session {
	return Session.restore(
		SessionId.from("s-1"),
		AgentName.from("support"),
		SessionMode.DURABLE,
		SessionStatus.SUSPENDED,
		SessionRevision.of(7),
		Instant.fromIso(CREATED_AT),
		Instant.fromIso(UPDATED_AT),
		SessionOwner.from("u-1"),
	);
}

/**
 * The head of a conversation as a row, which is the piece nobody could write from outside:
 * `Session.restore` asks for a `SessionStatus` and a table only ever has the word.
 */
describe("SessionHeadCodec", () => {
	it("encodes a session as the columns its table is made of", () => {
		const record = new SessionHeadCodec().encode(durable());

		expect(record).toEqual({
			id: "s-1",
			rootAgent: "support",
			mode: "durable",
			status: "suspended",
			revision: 7,
			createdAt: CREATED_AT,
			updatedAt: UPDATED_AT,
			owner: "u-1",
		});
	});

	it("brings back a session that means the same thing", () => {
		const codec = new SessionHeadCodec();
		const session = durable();

		expect(codec.decode(codec.encode(session))).toEqual(session);
	});

	/** Identity is what `acceptsCommands` compares on, so a copy of the status would not do. */
	it("decodes the status as the one instance the runtime decides on", () => {
		const codec = new SessionHeadCodec();

		const decoded = codec.decode(codec.encode(durable()));

		expect(decoded.status).toBe(SessionStatus.SUSPENDED);
		expect(decoded.mode).toBe(SessionMode.DURABLE);
	});

	it("keeps an ephemeral session without an owner", () => {
		const codec = new SessionHeadCodec();
		const session = Session.start(
			SessionId.from("s-2"),
			AgentName.from("support"),
			SessionMode.EPHEMERAL,
			Instant.fromIso(CREATED_AT),
		);

		expect(codec.encode(session).owner).toBeUndefined();
		expect(codec.decode(codec.encode(session)).owner).toBeUndefined();
	});

	it("decodes a plain row an adapter read out of its own table", () => {
		const decoded = new SessionHeadCodec().decode({
			id: "s-3",
			rootAgent: "billing",
			mode: "durable",
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
		const row = { ...codec.encode(durable()), status: "hibernating" };

		expect(() => codec.decode(row)).toThrow(UnreadableStoredValueError);
	});

	it("refuses a mode this runtime does not know", () => {
		const codec = new SessionHeadCodec();
		const row = { ...codec.encode(durable()), mode: "cached" };

		expect(() => codec.decode(row)).toThrow(UnreadableStoredValueError);
	});
});
