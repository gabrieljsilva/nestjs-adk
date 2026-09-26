import { describe, expect, it } from "vitest";
import { ArtifactId } from "../../common/identity/artifact-id.value-object";
import { SessionId } from "../../common/identity/session-id.value-object";
import { SessionRevision } from "../../common/revision/session-revision.value-object";
import { AttachmentReference } from "../../domain/model/attachment/attachment-reference.value-object";
import { AttachmentRequest } from "../../domain/model/attachment/attachment-request.value-object";
import { MediaPart } from "../../domain/model/messages/media-part.value-object";
import { RunContextFixture } from "../../support/run/run-context.fixture";
import { DefaultAttachmentResolver } from "./default-attachment-resolver.adapter";

const PIXEL = "iVBORw0KGgo=";

function requestOf(reference: AttachmentReference, part?: MediaPart): AttachmentRequest {
	return new AttachmentRequest(
		SessionId.from("s-1"),
		reference,
		SessionRevision.initial(),
		true,
		false,
		async () => part,
	);
}

const CTX = RunContextFixture.run("s-1");

describe("DefaultAttachmentResolver", () => {
	it("answers with what the runtime materialized, which is today's behaviour", async () => {
		const part = MediaPart.image("image/png", PIXEL);
		const resolver = new DefaultAttachmentResolver();

		const projection = await resolver.resolve(CTX, requestOf(AttachmentReference.artifact(ArtifactId.from("a-1")), part));

		expect(projection.isMedia).toBe(true);
		expect(projection.part).toBe(part);
	});

	it("omits what no longer materializes, exactly as before the port existed", async () => {
		const resolver = new DefaultAttachmentResolver();

		const projection = await resolver.resolve(CTX, requestOf(AttachmentReference.artifact(ArtifactId.from("a-404"))));

		expect(projection.isMedia).toBe(false);
		expect(projection.isNote).toBe(false);
	});

	it("projects a stored text artifact as the placeholder the artifact tools read, never as media", async () => {
		const resolver = new DefaultAttachmentResolver();
		const markdown = AttachmentReference.artifact(ArtifactId.from("a-7"), "text/markdown");

		const projection = await resolver.resolve(CTX, requestOf(markdown));

		expect(projection.isArtifact).toBe(true);
		expect(projection.isMedia).toBe(false);
	});

	it("still materializes a stored image as media, because a model looks at those", async () => {
		const part = MediaPart.image("image/png", PIXEL);
		const image = AttachmentReference.artifact(ArtifactId.from("a-8"), "image/png");

		const projection = await new DefaultAttachmentResolver().resolve(CTX, requestOf(image, part));

		expect(projection.isMedia).toBe(true);
	});

	it("projects an external reference as a note naming the gap, because it cannot reach the file", async () => {
		const resolver = new DefaultAttachmentResolver();

		const projection = await resolver.resolve(CTX, requestOf(AttachmentReference.external("file-7", "image/png")));

		expect(projection.text).toBe("[attachment image/png: no attachment resolver is configured]");
	});
});
