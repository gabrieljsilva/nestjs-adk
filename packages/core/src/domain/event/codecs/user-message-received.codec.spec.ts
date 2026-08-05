import { describe, expect, it } from "vitest";
import { AgentId } from "../../../common/identity/agent-id";
import { AgentRunId } from "../../../common/identity/agent-run-id";
import { ArtifactId } from "../../../common/identity/artifact-id";
import { CorrelationId } from "../../../common/identity/correlation-id";
import { EventId } from "../../../common/identity/event-id";
import { Instant } from "../../../common/time/instant";
import { UserMessageReceived } from "../catalog/user-message-received";
import { InvalidEventPayloadError } from "../errors/invalid-event-payload.error";
import { EventCorrelation } from "../event-correlation";
import { EventHeader } from "../event-header";
import { UserMessageReceivedCodec } from "./user-message-received.codec";

const header = new EventHeader(
	EventId.from("e-1"),
	Instant.fromIso("2026-01-01T00:00:00.000Z"),
	new EventCorrelation(AgentRunId.from("run-1"), AgentId.from("support"), CorrelationId.from("corr-1")),
);

const codec = new UserMessageReceivedCodec();

describe("UserMessageReceivedCodec", () => {
	it("is the version that records attachments", () => {
		expect(codec.schemaVersion.value).toBe(2);
	});

	it("leaves the field out when nothing was attached, because most messages attach nothing", () => {
		expect(codec.encode(new UserMessageReceived(header, "hi"))).toEqual({ text: "hi" });
	});

	it("writes the ids, and never the bytes behind them", () => {
		const event = new UserMessageReceived(header, "look", [ArtifactId.from("a-1"), ArtifactId.from("a-2")]);

		expect(codec.encode(event)).toEqual({ text: "look", attachments: ["a-1", "a-2"] });
	});

	it("round trips the ids in the order they were attached", () => {
		const event = new UserMessageReceived(header, "look", [ArtifactId.from("a-2"), ArtifactId.from("a-1")]);

		const decoded = codec.decode(codec.encode(event), header);

		expect(decoded.attachments.map((id) => id.value)).toEqual(["a-2", "a-1"]);
	});

	it("reads a payload written before attachments existed", () => {
		const decoded = codec.decode({ text: "hi" }, header);

		expect(decoded.text).toBe("hi");
		expect(decoded.hasAttachments).toBe(false);
	});

	it("refuses a payload whose attachments are not ids", () => {
		expect(() => codec.decode({ text: "hi", attachments: "a-1" }, header)).toThrow(InvalidEventPayloadError);
		expect(() => codec.decode({ text: "hi", attachments: [1] }, header)).toThrow(InvalidEventPayloadError);
	});
});
