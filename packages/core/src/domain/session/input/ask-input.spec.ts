import { describe, expect, it } from "vitest";
import { SessionId } from "../../../common/identity/session-id";
import { AttachmentReference } from "../../model/attachment/attachment-reference";
import { MediaLimits } from "../../model/descriptor/media-limits";
import { MediaTooLargeError } from "../../model/errors/media-too-large.error";
import { MediaPart } from "../../model/messages/media-part";
import { EmptyMessageError } from "../errors/empty-message.error";
import { AskInput } from "./ask-input";

const PIXEL = "iVBORw0KGgo=";

function imageOf(): MediaPart {
	return MediaPart.image("image/png", PIXEL);
}

describe("AskInput", () => {
	it("trims the message, because trailing space is not a question", () => {
		expect(AskInput.of("  hello  ").message).toBe("hello");
	});

	it("refuses a message with nothing in it", () => {
		expect(() => AskInput.of("   ")).toThrow(EmptyMessageError);
	});

	it("knows whether it continues a conversation", () => {
		expect(AskInput.of("hi").continuesSession).toBe(false);
		expect(AskInput.of("hi", SessionId.from("s-1")).continuesSession).toBe(true);
	});

	it("carries attachments in the order they were attached", () => {
		const input = AskInput.with("look", [imageOf(), imageOf()]);

		expect(input.hasAttachments).toBe(true);
		expect(input.attachments).toHaveLength(2);
	});

	it("still requires words, because an image with nothing asked about it is a guess", () => {
		expect(() => AskInput.with(" ", [imageOf()])).toThrow(EmptyMessageError);
	});

	it("refuses a set of attachments that only overflows together", () => {
		const limits = MediaLimits.of(1024, 1024, 20);

		expect(() => AskInput.with("look", [imageOf(), imageOf()], undefined, limits)).toThrow(MediaTooLargeError);
	});

	it("takes the same set when it fits", () => {
		const limits = MediaLimits.of(1024, 1024, 24);

		expect(AskInput.with("look", [imageOf(), imageOf()], undefined, limits).attachments).toHaveLength(2);
	});

	it("copies the list, so a caller cannot add to it afterwards", () => {
		const attachments = [imageOf()];
		const input = AskInput.with("look", attachments);

		attachments.push(imageOf());

		expect(input.attachments).toHaveLength(1);
	});

	it("carries references next to bytes, and either alone counts as attached", () => {
		const reference = AttachmentReference.external("file-7", "image/png");
		const input = AskInput.with("look", [], undefined, undefined, [reference]);

		expect(input.hasAttachments).toBe(true);
		expect(input.references).toEqual([reference]);
		expect(input.attachments).toEqual([]);
	});

	it("charges a reference nothing against the media total, because it carries no bytes", () => {
		const limits = MediaLimits.of(1024, 1024, 12);
		const references = [AttachmentReference.external("file-7", "image/png")];

		expect(AskInput.with("look", [imageOf()], undefined, limits, references).references).toHaveLength(1);
	});

	it("copies the reference list, so a caller cannot add to it afterwards", () => {
		const references = [AttachmentReference.external("file-7", "image/png")];
		const input = AskInput.with("look", [], undefined, undefined, references);

		references.push(AttachmentReference.external("file-8", "image/png"));

		expect(input.references).toHaveLength(1);
	});
});
