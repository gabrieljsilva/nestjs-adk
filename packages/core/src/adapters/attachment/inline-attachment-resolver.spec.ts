import { describe, expect, it } from "vitest";
import { SessionId } from "../../common/identity/session-id";
import { SessionRevision } from "../../common/revision/session-revision";
import { AttachmentReference } from "../../domain/model/attachment/attachment-reference";
import { AttachmentRequest } from "../../domain/model/attachment/attachment-request";
import { MediaPart } from "../../domain/model/messages/media-part";
import { SessionContext } from "../../domain/run/session-context";
import { InlineAttachmentResolver } from "./inline-attachment-resolver";

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

const CTX = SessionContext.fromSessionId(SessionId.from("s-1"));

describe("InlineAttachmentResolver", () => {
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
