import { describe, expect, it } from "vitest";
import { AgentId } from "../../../common/identity/agent-id.value-object";
import { AgentRunId } from "../../../common/identity/agent-run-id.value-object";
import { CorrelationId } from "../../../common/identity/correlation-id.value-object";
import { EventId } from "../../../common/identity/event-id.value-object";
import { Instant } from "../../../common/time/instant.value-object";
import { SessionMetadataDeleted } from "../catalog/metadata/session-metadata-deleted.event";
import { SessionMetadataSet } from "../catalog/metadata/session-metadata-set.event";
import { InvalidEventPayloadError } from "../errors/invalid-event-payload.error";
import { EventCorrelation } from "../event-correlation.value-object";
import { EventHeader } from "../event-header.value-object";
import { SessionMetadataDeletedCodec } from "./metadata/session-metadata-deleted.codec";
import { SessionMetadataSetCodec } from "./metadata/session-metadata-set.codec";

const header = new EventHeader(
	EventId.from("e-1"),
	Instant.fromIso("2026-01-01T00:00:00.000Z"),
	new EventCorrelation(AgentRunId.from("run-1"), AgentId.from("support"), CorrelationId.from("corr-1")),
);

describe("SessionMetadataSetCodec", () => {
	const codec = new SessionMetadataSetCodec();

	it("writes the key and the value as the row holds them", () => {
		expect(codec.encode(new SessionMetadataSet(header, "memberId", "gabriel"))).toEqual({
			key: "memberId",
			value: "gabriel",
		});
	});

	it("round trips a nested value whole", () => {
		const value = { tier: "gold", tags: ["a", "b"], seats: 3, active: true, seat: null };

		const decoded = codec.decode(codec.encode(new SessionMetadataSet(header, "plan", value)), header);

		expect(decoded.key).toBe("plan");
		expect(decoded.value).toEqual(value);
	});

	/** A row an older build or a migration wrote is not JSON by construction, only by habit. */
	it("refuses a value no session could have written", () => {
		expect(() => codec.decode({ key: "opened", value: new Date() }, header)).toThrow(InvalidEventPayloadError);
	});

	it("refuses a key that is not text", () => {
		expect(() => codec.decode({ key: 7, value: "gabriel" }, header)).toThrow(InvalidEventPayloadError);
	});
});

describe("SessionMetadataDeletedCodec", () => {
	const codec = new SessionMetadataDeletedCodec();

	it("writes only the key, because forgetting has no value", () => {
		expect(codec.encode(new SessionMetadataDeleted(header, "memberId"))).toEqual({ key: "memberId" });
	});

	it("brings back the key it was told to forget", () => {
		expect(codec.decode({ key: "memberId" }, header).key).toBe("memberId");
	});

	it("refuses a key that is not text", () => {
		expect(() => codec.decode({ key: null }, header)).toThrow(InvalidEventPayloadError);
	});
});
