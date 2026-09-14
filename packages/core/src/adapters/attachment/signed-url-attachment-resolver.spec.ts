import { describe, expect, it } from "vitest";
import { SessionId } from "../../common/identity/session-id";
import { SessionRevision } from "../../common/revision/session-revision";
import { AttachmentReference } from "../../domain/model/attachment-reference";
import { AttachmentRequest } from "../../domain/model/attachment-request";
import { MediaPart } from "../../domain/model/media-part";
import { SessionContext } from "../../domain/run/session-context";
import { SignedUrlAttachmentResolver } from "./signed-url-attachment-resolver";

const PIXEL = "iVBORw0KGgo=";
const EXTERNAL = AttachmentReference.external("file-7", "image/png");

function requestOf(reference: AttachmentReference, acceptsRemoteUrl: boolean, stored?: MediaPart): AttachmentRequest {
	return new AttachmentRequest(
		SessionId.from("s-1"),
		reference,
		SessionRevision.initial(),
		true,
		acceptsRemoteUrl,
		async () => stored,
	);
}

const CTX = SessionContext.fromSessionId(SessionId.from("s-1"));

describe("SignedUrlAttachmentResolver", () => {
	it("mints a fresh address for a model that fetches URLs itself", async () => {
		const resolver = new SignedUrlAttachmentResolver(async (externalId) => `https://cdn.example/${externalId}?sig=1`);

		const projection = await resolver.resolve(CTX, requestOf(EXTERNAL, true));

		expect(projection.part?.url).toBe("https://cdn.example/file-7?sig=1");
		expect(projection.part?.mediaType).toBe("image/png");
	});

	it("never hands an address to a model that would read it as text", async () => {
		let signed = 0;
		const resolver = new SignedUrlAttachmentResolver(async () => {
			signed += 1;
			return "https://cdn.example/file-7?sig=1";
		});

		const projection = await resolver.resolve(CTX, requestOf(EXTERNAL, false));

		expect(projection.text).toBe("[attachment image/png: the serving model cannot fetch a remote file]");
		expect(signed).toBe(0);
	});

	it("says the file is gone when the signer has nothing to sign", async () => {
		const resolver = new SignedUrlAttachmentResolver(async () => undefined);

		const projection = await resolver.resolve(CTX, requestOf(EXTERNAL, true));

		expect(projection.text).toBe("[attachment image/png: no longer available]");
	});

	it("answers everything that is not external the way the runtime would", async () => {
		const part = MediaPart.image("image/png", PIXEL);
		const resolver = new SignedUrlAttachmentResolver(async () => "https://cdn.example/never");

		const reference = AttachmentReference.link("https://cdn.example/x.png", "image/png");
		const materialized = await resolver.resolve(CTX, requestOf(reference, true, part));

		expect(materialized.part).toBe(part);
	});
});
