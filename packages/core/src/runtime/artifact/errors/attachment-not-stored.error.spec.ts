import { describe, expect, it } from "vitest";
import { AdkError } from "../../../common/errors/adk.error";
import { AttachmentNotStoredError } from "./attachment-not-stored.error";

describe("AttachmentNotStoredError", () => {
	it("carries a stable code", () => {
		expect(new AttachmentNotStoredError("image/png").code).toBe("ATTACHMENT_NOT_STORED");
	});

	it("keeps what the storage said, because that is the only clue to why it refused", () => {
		const cause = new Error("the bucket is unreachable");

		expect(new AttachmentNotStoredError("image/png", cause).cause).toBe(cause);
	});

	it("is an adk error", () => {
		expect(new AttachmentNotStoredError("image/png")).toBeInstanceOf(AdkError);
	});
});
