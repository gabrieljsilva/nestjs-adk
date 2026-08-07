import { describe, expect, it } from "vitest";
import { Attachment } from "./attachment";
import { InvalidAttachmentError } from "./errors/invalid-attachment.error";

describe("Attachment", () => {
	it("keeps where the file is and what it is", () => {
		const attachment = Attachment.of("https://files.example.test/broken-controller.jpg", "image/jpeg");

		expect(attachment.url).toBe("https://files.example.test/broken-controller.jpg");
		expect(attachment.mediaType).toBe("image/jpeg");
		expect(attachment.isImage).toBe(true);
	});

	it("knows a file that is not a picture", () => {
		expect(Attachment.of("https://files.example.test/invoice.pdf", "application/pdf").isImage).toBe(false);
	});

	it("refuses an address the store cannot fetch", () => {
		expect(() => Attachment.of("ftp://files.example.test/a.jpg", "image/jpeg")).toThrow(InvalidAttachmentError);
		expect(() => Attachment.of("/uploads/a.jpg", "image/jpeg")).toThrow(InvalidAttachmentError);
	});

	it("refuses something that is not a media type", () => {
		expect(() => Attachment.of("https://files.example.test/broken-controller.jpg", "jpeg")).toThrow(
			InvalidAttachmentError,
		);
		expect(() => Attachment.of("https://files.example.test/broken-controller.jpg", "")).toThrow(InvalidAttachmentError);
	});

	it("reads a list of attachments out of a request body", () => {
		const list = Attachment.listFrom([
			{ url: "https://files.example.test/broken-controller.jpg", mediaType: "image/jpeg" },
			{ url: "https://files.example.test/invoice.pdf", mediaType: "application/pdf" },
		]);

		expect(list).toHaveLength(2);
		expect(list.at(1)?.mediaType).toBe("application/pdf");
	});

	it("reads a message that carried no attachment", () => {
		expect(Attachment.listFrom(undefined)).toEqual([]);
		expect(Attachment.listFrom(null)).toEqual([]);
	});

	it("refuses a body that says it has attachments and does not", () => {
		expect(() => Attachment.listFrom("a photo")).toThrow(InvalidAttachmentError);
		expect(() => Attachment.listFrom([{ url: "https://files.example.test/broken-controller.jpg" }])).toThrow(
			InvalidAttachmentError,
		);
		expect(() => Attachment.listFrom([{ mediaType: "image/jpeg" }])).toThrow(InvalidAttachmentError);
	});

	/**
	 * Bytes, for a client that never uploaded anything.
	 *
	 * A phone that just took the picture has the file and no address for it, and making it
	 * upload first only to attach a link would be a round trip the conversation does not
	 * need.
	 */
	it("takes the bytes themselves, with no address behind them", () => {
		const attachment = Attachment.bytes(
			"iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
			"image/png",
		);

		expect(attachment.isHosted).toBe(false);
		expect(attachment.url).toBeUndefined();
		expect(attachment.mediaType).toBe("image/png");
	});

	it("refuses bytes that are not there", () => {
		expect(() => Attachment.bytes("", "image/png")).toThrow(InvalidAttachmentError);
		expect(() =>
			Attachment.bytes(
				"iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
				"png",
			),
		).toThrow(InvalidAttachmentError);
	});

	it("reads bytes out of a request body, alongside an address in the same list", () => {
		const list = Attachment.listFrom([
			{ url: "https://files.example.test/broken-controller.jpg", mediaType: "image/jpeg" },
			{
				base64: "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
				mediaType: "image/png",
			},
		]);

		expect(list.map((attachment) => attachment.isHosted)).toEqual([true, false]);
	});

	it("hands the runtime a link for an address and an image for bytes", () => {
		expect(Attachment.of("https://files.example.test/broken-controller.jpg", "image/jpeg").toMediaPart().url).toBe(
			"https://files.example.test/broken-controller.jpg",
		);
		expect(
			Attachment.bytes(
				"iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
				"image/png",
			).toMediaPart().url,
		).toBeUndefined();
		expect(
			Attachment.bytes(
				"iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
				"image/png",
			).toMediaPart().mediaType,
		).toBe("image/png");
	});
});
