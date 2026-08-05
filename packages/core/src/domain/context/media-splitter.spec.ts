import { describe, expect, it } from "vitest";
import { ToolCallId } from "../../common/identity/tool-call-id";
import { AssistantMessage } from "../model/assistant-message";
import { MediaPart } from "../model/media-part";
import { ToolResultMessage } from "../model/tool-result-message";
import { UserMessage } from "../model/user-message";
import { MediaSplitter } from "./media-splitter";

const CALL = ToolCallId.from("c-1");
const PIXEL = "iVBORw0KGgo=";

function resultWithImage(): ToolResultMessage {
	return new ToolResultMessage(CALL, "render_chart", { rendered: true }, false, [MediaPart.image("image/png", PIXEL)]);
}

describe("MediaSplitter", () => {
	it("leaves a conversation without tool media exactly as it was", () => {
		const messages = [new UserMessage("hi"), new AssistantMessage("hello")];

		expect(new MediaSplitter().split(messages)).toBe(messages);
	});

	it("takes the image off the result and puts it in the message right after", () => {
		const split = new MediaSplitter().split([new UserMessage("chart it"), resultWithImage()]);

		expect(split).toHaveLength(3);
		expect(split[1]).toBeInstanceOf(ToolResultMessage);
		expect(split[2]).toBeInstanceOf(UserMessage);
	});

	it("keeps the data on the result, because that is the answer", () => {
		const split = new MediaSplitter().split([resultWithImage()]);
		const result = split[0];

		expect(result?.text).toContain("rendered");
		expect(result instanceof ToolResultMessage && result.hasMedia).toBe(false);
	});

	it("names the tool in the message that carries the image", () => {
		const carrier = new MediaSplitter().split([resultWithImage()])[1];

		expect(carrier?.text).toContain("render_chart");
		expect(carrier instanceof UserMessage && carrier.media[0]?.base64).toBe(PIXEL);
	});

	it("splits every result that has media, and nothing else", () => {
		const plain = new ToolResultMessage(CALL, "lookup", { status: "ok" }, false);

		const split = new MediaSplitter().split([resultWithImage(), plain, resultWithImage()]);

		expect(split).toHaveLength(5);
		expect(split[2]).toBe(plain);
	});

	it("keeps the order, so an answer is always followed by what it looked like", () => {
		const split = new MediaSplitter().split([resultWithImage(), new AssistantMessage("here it is")]);

		expect(split[0]).toBeInstanceOf(ToolResultMessage);
		expect(split[1]).toBeInstanceOf(UserMessage);
		expect(split[2]).toBeInstanceOf(AssistantMessage);
	});
});
