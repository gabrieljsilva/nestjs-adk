import { describe, expect, it } from "vitest";
import { ArtifactId } from "../../common/identity/artifact-id.value-object";
import { SessionId } from "../../common/identity/session-id.value-object";
import { SessionRevision } from "../../common/revision/session-revision.value-object";
import { AttachmentReference } from "../../domain/model/attachment/attachment-reference.value-object";
import { AttachmentRequest } from "../../domain/model/attachment/attachment-request.value-object";
import { MediaPart } from "../../domain/model/messages/media-part.value-object";
import { RunContextFixture } from "../../support/run/run-context.fixture";
import { InlineAttachmentResolver } from "./inline-attachment-resolver.adapter";

const PIXEL = "iVBORw0KGgo=";

function requestOf(reference: AttachmentReference, stored?: MediaPart): AttachmentRequest {
	return new AttachmentRequest(
		SessionId.from("s-1"),
		reference,
		SessionRevision.initial(),
		true,
		false,
		async () => stored,
	);
}

const CTX = RunContextFixture.run("s-1");

describe("InlineAttachmentResolver", () => {
	it("leaves a stored text artifact to the artifact tools, so the loader is never asked about it", async () => {
		let asked = 0;
		const resolver = new InlineAttachmentResolver(async () => {
			asked += 1;
			return undefined;
		});
		const stored = AttachmentReference.artifact(ArtifactId.from("a-1"), "text/markdown");

		const projection = await resolver.resolve(CTX, requestOf(stored));

		expect(projection.isArtifact).toBe(true);
		expect(asked).toBe(0);
	});

	it("fetches an external file server side and inlines it, so no address ever travels", async () => {
		const part = MediaPart.image("image/png", PIXEL);
		const resolver = new InlineAttachmentResolver(async (externalId) => (externalId === "file-7" ? part : undefined));

		const projection = await resolver.resolve(CTX, requestOf(AttachmentReference.external("file-7", "image/png")));

		expect(projection.part).toBe(part);
	});

	it("says the file is gone instead of saying nothing", async () => {
		const resolver = new InlineAttachmentResolver(async () => undefined);

		const projection = await resolver.resolve(CTX, requestOf(AttachmentReference.external("file-7", "image/png")));

		expect(projection.text).toBe("[attachment image/png: no longer available]");
	});

	it("hands the loader the request, which is where per-turn policy lives", async () => {
		const seen: boolean[] = [];
		const resolver = new InlineAttachmentResolver(async (_, request) => {
			seen.push(request.isCurrentRun);
			return undefined;
		});

		await resolver.resolve(CTX, requestOf(AttachmentReference.external("file-7", "image/png")));

		expect(seen).toEqual([true]);
	});

	it("answers everything that is not external the way the runtime would", async () => {
		const part = MediaPart.image("image/png", PIXEL);
		const resolver = new InlineAttachmentResolver(async () => undefined);

		const reference = AttachmentReference.link("https://cdn.example/x.png", "image/png");
		const materialized = await resolver.resolve(CTX, requestOf(reference, part));
		const gone = await resolver.resolve(CTX, requestOf(reference));

		expect(materialized.part).toBe(part);
		expect(gone.isMedia).toBe(false);
		expect(gone.isNote).toBe(false);
	});
});
