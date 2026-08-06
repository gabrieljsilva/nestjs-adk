import { AdkError } from "@nestjs-adk/core";
import { describe, expect, it } from "vitest";
import { InvalidAttachmentError } from "./invalid-attachment.error";

describe("InvalidAttachmentError", () => {
	it("names what arrived and what was expected of it", () => {
		const error = new InvalidAttachmentError("ftp://x/a.png", "an http address");

		expect(error.received).toBe("ftp://x/a.png");
		expect(error.expected).toBe("an http address");
		expect(error.message).toBe("Attachment ftp://x/a.png is not an http address.");
	});

	it("is an AdkError with a code a caller can branch on", () => {
		expect(new InvalidAttachmentError("x", "y")).toBeInstanceOf(AdkError);
		expect(new InvalidAttachmentError("x", "y").code).toBe("PLAYGROUND_INVALID_ATTACHMENT");
	});
});
