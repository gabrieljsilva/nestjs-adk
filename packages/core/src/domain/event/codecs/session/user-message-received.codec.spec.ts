import { describe, expect, it } from "vitest";
import { AgentId } from "../../../../common/identity/agent-id";
import { AgentRunId } from "../../../../common/identity/agent-run-id";
import { ArtifactId } from "../../../../common/identity/artifact-id";
import { CorrelationId } from "../../../../common/identity/correlation-id";
import { EventId } from "../../../../common/identity/event-id";
import { Instant } from "../../../../common/time/instant";
import { AttachmentReference } from "../../../model/attachment/attachment-reference";
import { UserMessageReceived } from "../../catalog/session/user-message-received";
import { InvalidEventPayloadError } from "../../errors/invalid-event-payload.error";
import { EventCorrelation } from "../../event-correlation";
import { EventHeader } from "../../event-header";
import { UserMessageReceivedCodec } from "./user-message-received.codec";

const header = new EventHeader(
	EventId.from("e-1"),
	Instant.fromIso("2026-01-01T00:00:00.000Z"),
	new EventCorrelation(AgentRunId.from("run-1"), AgentId.from("support"), CorrelationId.from("corr-1")),
);

const codec = new UserMessageReceivedCodec();

function artifact(id: string): AttachmentReference {
	return AttachmentReference.artifact(ArtifactId.from(id));
}

describe("UserMessageReceivedCodec", () => {
	it("is the version that names the actor the question was asked with", () => {
		expect(codec.schemaVersion.value).toBe(5);
	});

	it("names the actor, and only the id, because claims are read at the call", () => {
		expect(codec.encode(new UserMessageReceived(header, "hi", [], "u-1"))).toEqual({ text: "hi", actorId: "u-1" });
	});

	/** Absent before version 5, which recorded what was said without saying who said it. */
	it("decodes a row written before anybody was named as a message with no actor", () => {
		expect(codec.decode({ text: "hi" }, header).actorId).toBeUndefined();
	});

	it("leaves the field out when nothing was attached, because most messages attach nothing", () => {
		expect(codec.encode(new UserMessageReceived(header, "hi"))).toEqual({ text: "hi", actorId: null });
	});

	it("writes the ids, and never the bytes behind them", () => {
		const event = new UserMessageReceived(header, "look", [artifact("a-1"), artifact("a-2")]);

		expect(codec.encode(event)).toEqual({ text: "look", actorId: null, attachments: [{ id: "a-1" }, { id: "a-2" }] });
	});

	it("writes a link as the address it already was, with the type nothing else knows", () => {
		const event = new UserMessageReceived(header, "look", [
			AttachmentReference.link("https://cdn.example/x.png", "image/png"),
		]);

		expect(codec.encode(event)).toEqual({
			text: "look",
			actorId: null,
			attachments: [{ url: "https://cdn.example/x.png", mediaType: "image/png" }],
		});
	});

	it("round trips both kinds in the order they were attached", () => {
		const event = new UserMessageReceived(header, "look", [
			AttachmentReference.link("https://cdn.example/x.png", "image/png"),
			artifact("a-1"),
		]);

		const decoded = codec.decode(codec.encode(event), header);

		expect(decoded.attachments[0]?.url).toBe("https://cdn.example/x.png");
		expect(decoded.attachments[1]?.artifactId?.value).toBe("a-1");
	});

	it("reads the bare ids the first version of the field wrote", () => {
		const decoded = codec.decode({ text: "look", attachments: ["a-1"] }, header);

		expect(decoded.attachments[0]?.artifactId?.value).toBe("a-1");
		expect(decoded.attachments[0]?.isLink).toBe(false);
	});

	it("reads a payload written before attachments existed", () => {
		const decoded = codec.decode({ text: "hi" }, header);

		expect(decoded.text).toBe("hi");
		expect(decoded.hasAttachments).toBe(false);
	});

	it("refuses a payload whose attachments name nothing", () => {
		expect(() => codec.decode({ text: "hi", attachments: "a-1" }, header)).toThrow(InvalidEventPayloadError);
		expect(() => codec.decode({ text: "hi", attachments: [1] }, header)).toThrow(InvalidEventPayloadError);
		expect(() => codec.decode({ text: "hi", attachments: [{}] }, header)).toThrow(InvalidEventPayloadError);
	});
});
