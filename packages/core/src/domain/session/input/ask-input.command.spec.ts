import { describe, expect, it } from "vitest";
import { ArtifactId } from "../../../common/identity/artifact-id.value-object";
import { SessionId } from "../../../common/identity/session-id.value-object";
import { ArtifactContent } from "../../artifact/artifact-content.value-object";
import { AttachmentReference } from "../../model/attachment/attachment-reference.value-object";
import { MediaLimits } from "../../model/descriptor/media-limits.value-object";
import { MediaTooLargeError } from "../../model/errors/media-too-large.error";
import { MediaPart } from "../../model/messages/media-part.value-object";
import { EmptyMessageError } from "../errors/empty-message.error";
import { AskInput } from "./ask-input.command";

const PIXEL = "iVBORw0KGgo=";

function imageOf(): MediaPart {
	return MediaPart.image("image/png", PIXEL);
}

describe("AskInput", () => {
	it("trims the message, because trailing space is not a question", () => {
		expect(AskInput.fromMessage("  hello  ").message).toBe("hello");
	});

	it("refuses a message with nothing in it", () => {
		expect(() => AskInput.fromMessage("   ")).toThrow(EmptyMessageError);
	});

	it("knows whether it continues a conversation", () => {
		expect(AskInput.fromMessage("hi").continuesSession).toBe(false);
		expect(AskInput.fromMessage("hi", SessionId.from("s-1")).continuesSession).toBe(true);
	});

	it("carries attachments in the order they were attached", () => {
		const input = new AskInput({
			message: "look",
			attachments: [imageOf(), imageOf()],
		});

		expect(input.hasAttachments).toBe(true);
		expect(input.attachments).toHaveLength(2);
	});

	it("carries files as attachments a tool reads, and they do not ask for a model that sees", () => {
		const input = new AskInput({
			message: "summarize",
			files: [ArtifactContent.fromText("# notes", "text/markdown")],
		});

		expect(input.hasAttachments).toBe(true);
		expect(input.hasMediaAttachments).toBe(false);
		expect(input.files).toHaveLength(1);
	});

	it("asks for a model that sees only for an image, whichever form it arrived in", () => {
		const image = new AskInput({ message: "look", attachments: [imageOf()] });
		const imageReference = new AskInput({
			message: "look",
			references: [AttachmentReference.artifact(ArtifactId.from("a-1"), "image/png")],
		});
		const textReference = new AskInput({
			message: "read",
			references: [AttachmentReference.artifact(ArtifactId.from("a-2"), "text/csv")],
		});
		const unknownReference = new AskInput({
			message: "look",
			references: [AttachmentReference.artifact(ArtifactId.from("a-3"))],
		});

		expect(image.hasMediaAttachments).toBe(true);
		expect(imageReference.hasMediaAttachments).toBe(true);
		expect(textReference.hasMediaAttachments).toBe(false);
		expect(unknownReference.hasMediaAttachments).toBe(true);
	});

	it("still requires words, because an image with nothing asked about it is a guess", () => {
		expect(
			() =>
				new AskInput({
					message: " ",
					attachments: [imageOf()],
				}),
		).toThrow(EmptyMessageError);
	});

	it("refuses a set of attachments that only overflows together", () => {
		const limits = new MediaLimits(1024, 1024, 20);

		expect(
			() =>
				new AskInput({
					message: "look",
					attachments: [imageOf(), imageOf()],
					limits: limits,
				}),
		).toThrow(MediaTooLargeError);
	});

	it("takes the same set when it fits", () => {
		const limits = new MediaLimits(1024, 1024, 24);

		expect(
			new AskInput({
				message: "look",
				attachments: [imageOf(), imageOf()],
				limits: limits,
			}).attachments,
		).toHaveLength(2);
	});

	it("copies the list, so a caller cannot add to it afterwards", () => {
		const attachments = [imageOf()];
		const input = new AskInput({
			message: "look",
			attachments: attachments,
		});

		attachments.push(imageOf());

		expect(input.attachments).toHaveLength(1);
	});

	it("carries references next to bytes, and either alone counts as attached", () => {
		const reference = AttachmentReference.external("file-7", "image/png");
		const input = new AskInput({
			message: "look",
			attachments: [],
			references: [reference],
		});

		expect(input.hasAttachments).toBe(true);
		expect(input.references).toEqual([reference]);
		expect(input.attachments).toEqual([]);
	});

	it("charges a reference nothing against the media total, because it carries no bytes", () => {
		const limits = new MediaLimits(1024, 1024, 12);
		const references = [AttachmentReference.external("file-7", "image/png")];

		expect(
			new AskInput({
				message: "look",
				attachments: [imageOf()],
				limits: limits,
				references: references,
			}).references,
		).toHaveLength(1);
	});

	it("copies the reference list, so a caller cannot add to it afterwards", () => {
		const references = [AttachmentReference.external("file-7", "image/png")];
		const input = new AskInput({
			message: "look",
			attachments: [],
			references: references,
		});

		references.push(AttachmentReference.external("file-8", "image/png"));

		expect(input.references).toHaveLength(1);
	});
});
