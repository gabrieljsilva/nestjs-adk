import { describe, expect, it } from "vitest";
import { ToolCallId } from "../../../common/identity/tool-call-id";
import { AssistantMessage } from "../../../domain/model/assistant-message";
import { MediaPart } from "../../../domain/model/media-part";
import { ToolCallMessage } from "../../../domain/model/tool-call-message";
import { ToolResultMessage } from "../../../domain/model/tool-result-message";
import { UserMessage } from "../../../domain/model/user-message";
import { UnreadableStoredValueError } from "./errors/unreadable-stored-value.error";
import { ModelMessageCodec } from "./model-message-codec";

const PIXEL = "iVBORw0KGgo=";

/**
 * What a compacted context is made of, as rows.
 *
 * A checkpoint holds messages, and a message read back as the wrong subclass is a request
 * a provider refuses: the adapters translate by role, and a tool call rebuilt as prose
 * loses the id the result is tied to.
 */
describe("ModelMessageCodec", () => {
	it("round trips what the user said", () => {
		const codec = new ModelMessageCodec();
		const message = new UserMessage("hi");

		expect(codec.decode(codec.encode(message))).toEqual(message);
	});

	it("round trips what the model answered", () => {
		const codec = new ModelMessageCodec();
		const message = new AssistantMessage("hello");

		const decoded = codec.decode(codec.encode(message));

		expect(decoded).toBeInstanceOf(AssistantMessage);
		expect(decoded.text).toBe("hello");
	});

	/** The signature is the provider's token: a turn replayed without it is refused. */
	it("round trips a tool call with the signature the provider handed back", () => {
		const codec = new ModelMessageCodec();
		const message = new ToolCallMessage(ToolCallId.from("c-1"), "refund", { orderId: "A-1" }, "sig-1");

		const decoded = codec.decode(codec.encode(message));

		expect(decoded).toBeInstanceOf(ToolCallMessage);
		expect(decoded).toEqual(message);
	});

	it("round trips a tool result, failure and all", () => {
		const codec = new ModelMessageCodec();
		const message = new ToolResultMessage(ToolCallId.from("c-1"), "refund", { error: "declined" }, true);

		const decoded = codec.decode(codec.encode(message));

		expect(decoded).toBeInstanceOf(ToolResultMessage);
		expect(decoded).toEqual(message);
	});

	it("round trips an image that travels as bytes", () => {
		const codec = new ModelMessageCodec();
		const message = new UserMessage("look", [MediaPart.image("image/png", PIXEL)]);

		const decoded = codec.decode(codec.encode(message));

		expect(decoded).toEqual(message);
	});

	/** A link costs nothing to store and nothing to send, and must not come back as bytes. */
	it("round trips an image the provider fetches for itself", () => {
		const codec = new ModelMessageCodec();
		const link = MediaPart.link("https://cdn.example.com/a.png", "image/png");

		const decoded = codec.decode(codec.encode(new UserMessage("look", [link])));

		expect(decoded).toEqual(new UserMessage("look", [link]));
	});

	it("refuses a role no version of this runtime wrote", () => {
		const codec = new ModelMessageCodec();
		const row = { ...codec.encode(new AssistantMessage("hello")), role: "narrator" };

		expect(() => codec.decode(row)).toThrow(UnreadableStoredValueError);
	});
});
