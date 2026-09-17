import { describe, expect, it } from "vitest";
import { ArtifactId } from "../../common/identity/artifact-id";
import { SessionId } from "../../common/identity/session-id";
import { SessionRevision } from "../../common/revision/session-revision";
import { AttachmentReference } from "../../domain/model/attachment/attachment-reference";
import { AttachmentRequest } from "../../domain/model/attachment/attachment-request";
import { MediaPart } from "../../domain/model/messages/media-part";
import { SessionContext } from "../../domain/run/session-context";
import { DefaultAttachmentResolver } from "./default-attachment-resolver";

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

const CTX = SessionContext.fromSessionId(SessionId.from("s-1"));

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

	it("projects an external reference as a note naming the gap, because it cannot reach the file", async () => {
		const resolver = new DefaultAttachmentResolver();

		const projection = await resolver.resolve(CTX, requestOf(AttachmentReference.external("file-7", "image/png")));

		expect(projection.text).toBe("[attachment image/png: no attachment resolver is configured]");
	});
});
