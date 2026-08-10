import { describe, expect, it } from "vitest";
import { SessionId } from "../../common/identity/session-id";
import { SessionRevision } from "../../common/revision/session-revision";
import { AttachmentReference } from "./attachment-reference";
import { AttachmentRequest } from "./attachment-request";
import { MediaPart } from "./media-part";

const PIXEL = "iVBORw0KGgo=";

function requestOf(loader: () => Promise<MediaPart | undefined>): AttachmentRequest {
	return new AttachmentRequest(
		SessionId.from("s-1"),
		AttachmentReference.external("file-7", "image/png"),
		SessionRevision.initial(),
		true,
		false,
		loader,
	);
}

describe("AttachmentRequest", () => {
	it("answers the runtime's own materialization through load", async () => {
		const part = MediaPart.image("image/png", PIXEL);

		expect(await requestOf(async () => part).load()).toBe(part);
	});

	it("answers nothing when the runtime has nothing, which is every external reference", async () => {
		expect(await requestOf(async () => undefined).load()).toBeUndefined();
	});

	it("tells the resolver where the attachment sits and what the request can carry", () => {
		const request = requestOf(async () => undefined);

		expect(request.sessionId.value).toBe("s-1");
		expect(request.reference.externalId).toBe("file-7");
		expect(request.revision.equals(SessionRevision.initial())).toBe(true);
		expect(request.isCurrentRun).toBe(true);
		expect(request.acceptsRemoteUrl).toBe(false);
	});
});
