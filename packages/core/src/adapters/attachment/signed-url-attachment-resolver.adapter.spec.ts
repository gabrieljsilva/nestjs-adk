import { describe, expect, it } from "vitest";
import { ArtifactId } from "../../common/identity/artifact-id.value-object";
import { SessionId } from "../../common/identity/session-id.value-object";
import { SessionRevision } from "../../common/revision/session-revision.value-object";
import { AttachmentReference } from "../../domain/model/attachment/attachment-reference.value-object";
import { AttachmentRequest } from "../../domain/model/attachment/attachment-request.value-object";
import { MediaPart } from "../../domain/model/messages/media-part.value-object";
import { RunContextFixture } from "../../support/run/run-context.fixture";
import { SignedUrlAttachmentResolver } from "./signed-url-attachment-resolver.adapter";

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

const CTX = RunContextFixture.run("s-1");

describe("SignedUrlAttachmentResolver", () => {
	it("leaves a stored text artifact to the artifact tools, minting nothing for it", async () => {
		let signed = 0;
		const resolver = new SignedUrlAttachmentResolver(async () => {
			signed += 1;
			return "https://cdn.example/never";
		});
		const stored = AttachmentReference.artifact(ArtifactId.from("a-1"), "text/csv");

		const projection = await resolver.resolve(CTX, requestOf(stored, true));

		expect(projection.isArtifact).toBe(true);
		expect(signed).toBe(0);
	});

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
