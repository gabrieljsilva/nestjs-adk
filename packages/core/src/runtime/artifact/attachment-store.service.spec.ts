import { describe, expect, it } from "vitest";
import { InMemoryArtifactStorage } from "../../adapters/storage/in-memory-artifact-storage.adapter";
import { SessionId } from "../../common/identity/session-id.value-object";
import { ArtifactStorage } from "../../contracts/storage/artifact-storage.contract";
import type { ArtifactContent } from "../../domain/artifact/artifact-content.value-object";
import type { ArtifactReference } from "../../domain/artifact/artifact-reference.value-object";
import { AttachmentReference } from "../../domain/model/attachment/attachment-reference.value-object";
import { MediaPart } from "../../domain/model/messages/media-part.value-object";
import { SessionContext } from "../../domain/run/session-context.value-object";
import { SequenceIdGenerator } from "../../support/sequence-id-generator.double";
import { AttachmentStore } from "./attachment-store.service";
import { AttachmentNotStoredError } from "./errors/attachment-not-stored.error";

const SESSION = SessionId.from("s-1");
const CTX = SessionContext.fromSessionId(SESSION);
const PIXEL = "iVBORw0KGgo=";

class RefusingArtifactStorage extends ArtifactStorage {
	public async put(): Promise<ArtifactReference> {
		throw new Error("the bucket is unreachable");
	}

	public async read(): Promise<ArtifactContent> {
		throw new Error("the bucket is unreachable");
	}

	public async find(): Promise<ArtifactReference | undefined> {
		return undefined;
	}

	public async deleteAll(): Promise<void> {
		return undefined;
	}
}

function storageOf(): InMemoryArtifactStorage {
	return new InMemoryArtifactStorage(new SequenceIdGenerator("a"));
}

describe("AttachmentStore", () => {
	it("answers with one id per attachment, in the order they were attached", async () => {
		const store = new AttachmentStore(storageOf());

		const stored = await store.store(CTX, [MediaPart.image("image/png", PIXEL), MediaPart.image("image/jpeg", PIXEL)]);

		expect(stored).toHaveLength(2);
		expect(stored[0]?.artifactId?.value).not.toBe(stored[1]?.artifactId?.value);
	});

	it("writes the bytes and the type, so the image can be read back as it was sent", async () => {
		const storage = storageOf();
		const store = new AttachmentStore(storage);

		const stored = await store.store(CTX, [MediaPart.image("image/png", PIXEL)]);
		const id = stored[0]?.artifactId;
		if (id === undefined) throw new Error("expected one id");
		const reference = await storage.find(CTX, id);
		if (reference === undefined) throw new Error("expected the artifact to be readable");

		const content = await storage.read(CTX, reference);
		expect(content.text).toBe(PIXEL);
		expect(content.mediaType).toBe("image/png");
	});

	it("writes nothing when there is nothing attached", async () => {
		expect(await new AttachmentStore(storageOf()).store(CTX, [])).toEqual([]);
	});

	it("records a link as the address it already was, without writing anything", async () => {
		const storage = storageOf();
		const store = new AttachmentStore(storage);

		const stored = await store.store(CTX, [MediaPart.link("https://cdn.example/x.png", "image/png")]);

		expect(stored[0]?.isLink).toBe(true);
		expect(stored[0]?.url).toBe("https://cdn.example/x.png");
		expect(stored[0]?.mediaType).toBe("image/png");
	});

	it("takes a link even when nothing can be written, because nothing has to be", async () => {
		const store = new AttachmentStore(new RefusingArtifactStorage());

		const stored = await store.store(CTX, [MediaPart.link("https://cdn.example/x.png", "image/png")]);

		expect(stored[0]?.isLink).toBe(true);
	});

	it("ends the command when the storage refuses, because there is no inline fallback", async () => {
		const store = new AttachmentStore(new RefusingArtifactStorage());

		await expect(store.store(CTX, [MediaPart.image("image/png", PIXEL)])).rejects.toBeInstanceOf(
			AttachmentNotStoredError,
		);
	});

	it("passes a reference through untouched, after everything that needed writing", async () => {
		const store = new AttachmentStore(storageOf());
		const external = AttachmentReference.external("file-7", "image/png");

		const stored = await store.store(CTX, [MediaPart.image("image/png", PIXEL)], [external]);

		expect(stored).toHaveLength(2);
		expect(stored[0]?.artifactId).toBeDefined();
		expect(stored[1]).toBe(external);
	});

	it("takes a reference even when nothing can be written, because nothing has to be", async () => {
		const store = new AttachmentStore(new RefusingArtifactStorage());
		const external = AttachmentReference.external("file-7", "image/png");

		const stored = await store.store(CTX, [], [external]);

		expect(stored).toEqual([external]);
	});
});
