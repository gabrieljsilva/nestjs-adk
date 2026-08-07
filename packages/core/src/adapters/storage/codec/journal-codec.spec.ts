import { describe, expect, it } from "vitest";
import { AgentId } from "../../../common/identity/agent-id";
import { AgentRunId } from "../../../common/identity/agent-run-id";
import { CorrelationId } from "../../../common/identity/correlation-id";
import { EventId } from "../../../common/identity/event-id";
import { ToolCallId } from "../../../common/identity/tool-call-id";
import { Instant } from "../../../common/time/instant";
import { AgentName } from "../../../domain/agent/agent-name";
import { SessionCreated } from "../../../domain/event/catalog/session-created";
import { ToolCallRequested } from "../../../domain/event/catalog/tool-call-requested";
import { UserMessageReceived } from "../../../domain/event/catalog/user-message-received";
import { UnknownSessionEventTypeError } from "../../../domain/event/errors/unknown-session-event-type.error";
import { UnsupportedSessionEventVersionError } from "../../../domain/event/errors/unsupported-session-event-version.error";
import { EventCorrelation } from "../../../domain/event/event-correlation";
import { EventHeader } from "../../../domain/event/event-header";
import { JournalCodec } from "./journal-codec";

const OCCURRED_AT = "2026-01-01T00:00:00.000Z";

function headerOf(causation?: string): EventHeader {
	return new EventHeader(
		EventId.from("e-1"),
		Instant.fromIso(OCCURRED_AT),
		new EventCorrelation(
			AgentRunId.from("run-1"),
			AgentId.from("support"),
			CorrelationId.from("corr-1"),
			causation === undefined ? undefined : EventId.from(causation),
		),
	);
}

/**
 * The codec an adapter outside this package writes its journal table with.
 *
 * Every case here is a row leaving and coming back, because that is the only promise the
 * port makes about events: what `readEvents` yields has to be the event that was written,
 * as the class the projectors decide on, or a session rehydrates into silence.
 */
describe("JournalCodec", () => {
	it("encodes an event as the columns a journal row is made of", () => {
		const record = new JournalCodec().encode(new UserMessageReceived(headerOf(), "hi"));

		expect(record).toEqual({
			eventId: "e-1",
			type: UserMessageReceived.TYPE,
			schemaVersion: 3,
			occurredAt: OCCURRED_AT,
			runId: "run-1",
			agentId: "support",
			correlationId: "corr-1",
			causationId: undefined,
			payload: { text: "hi" },
		});
	});

	it("carries the causation of an event that has one", () => {
		const record = new JournalCodec().encode(new UserMessageReceived(headerOf("e-0"), "hi"));

		expect(record.causationId).toBe("e-0");
	});

	/**
	 * The whole point of the codec: a duck typed object passes every `instanceof` in the
	 * projectors without entering one, and the conversation reads back as empty.
	 */
	it("decodes a row back into the event class the runtime decides on", () => {
		const codec = new JournalCodec();

		const decoded = codec.decode(codec.encode(new UserMessageReceived(headerOf(), "hi")));

		expect(decoded).toBeInstanceOf(UserMessageReceived);
	});

	it("brings back everything the event was written with", () => {
		const codec = new JournalCodec();
		const call = new ToolCallRequested(headerOf("e-0"), ToolCallId.from("c-1"), "refund", { orderId: "A-1" }, "sig-1");

		const decoded = codec.decode(codec.encode(call));

		expect(decoded).toEqual(call);
	});

	it("rebuilds the header, so a decoded event still says who produced it and when", () => {
		const codec = new JournalCodec();

		const decoded = codec.decode(codec.encode(new SessionCreated(headerOf(), AgentName.from("support"), "u-1")));

		expect(decoded.id.value).toBe("e-1");
		expect(decoded.occurredAt.toIso()).toBe(OCCURRED_AT);
		expect(decoded.correlation.runId.value).toBe("run-1");
		expect(decoded.correlation.agentId.value).toBe("support");
	});

	/** A database row is loose data, so the adapter hands it over as it came. */
	it("decodes a plain row an adapter read out of its own table", () => {
		const decoded = new JournalCodec().decode({
			eventId: "e-9",
			type: UserMessageReceived.TYPE,
			schemaVersion: 3,
			occurredAt: OCCURRED_AT,
			runId: "run-2",
			agentId: "billing",
			correlationId: "corr-2",
			causationId: null,
			payload: { text: "again" },
		});

		expect(decoded).toBeInstanceOf(UserMessageReceived);
	});

	it("takes a payload the driver already parsed and one it handed back as text alike", () => {
		const codec = new JournalCodec();
		const row = { ...codec.encode(new UserMessageReceived(headerOf(), "hi")) };

		const decoded = codec.decode({ ...row, payload: JSON.stringify(row.payload) });

		expect(decoded).toEqual(codec.decode(row));
	});

	it("refuses a row whose type no build of this runtime knows", () => {
		const codec = new JournalCodec();
		const row = { ...codec.encode(new UserMessageReceived(headerOf(), "hi")), type: "session.invented" };

		expect(() => codec.decode(row)).toThrow(UnknownSessionEventTypeError);
	});

	/** Reading it would drop meaning this build has no codec for, silently. */
	it("refuses a row written by a newer build than this one", () => {
		const codec = new JournalCodec();
		const row = { ...codec.encode(new UserMessageReceived(headerOf(), "hi")), schemaVersion: 99 };

		expect(() => codec.decode(row)).toThrow(UnsupportedSessionEventVersionError);
	});

	/**
	 * Recognizing a retry means comparing content and not only ids, and an adapter that
	 * fingerprints its own way would disagree with the one this library ships.
	 */
	it("fingerprints an event the same way twice", () => {
		const codec = new JournalCodec();
		const event = new ToolCallRequested(headerOf(), ToolCallId.from("c-1"), "refund", { orderId: "A-1" });

		expect(codec.fingerprintOf(event)).toBe(codec.fingerprintOf(event));
	});

	it("fingerprints two different events differently", () => {
		const codec = new JournalCodec();
		const first = new ToolCallRequested(headerOf(), ToolCallId.from("c-1"), "refund", { orderId: "A-1" });
		const second = new ToolCallRequested(headerOf(), ToolCallId.from("c-1"), "refund", { orderId: "A-2" });

		expect(codec.fingerprintOf(first)).not.toBe(codec.fingerprintOf(second));
	});
});
