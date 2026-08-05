import { describe, expect, it } from "vitest";
import { InMemoryArtifactStorage } from "../../adapters/storage/in-memory-artifact-storage";
import { SessionId } from "../../common/identity/session-id";
import { ArtifactStorage } from "../../contracts/artifact-storage";
import type { ArtifactContent } from "../../domain/artifact/artifact-content";
import type { ArtifactReference } from "../../domain/artifact/artifact-reference";
import { MediaPart } from "../../domain/model/media-part";
import { SequenceIdGenerator } from "../../support/sequence-id-generator";
import { AttachmentStore } from "./attachment-store";
import { AttachmentNotStoredError } from "./errors/attachment-not-stored.error";

const SESSION = SessionId.from("s-1");
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

		const stored = await store.store(SESSION, [
			MediaPart.image("image/png", PIXEL),
			MediaPart.image("image/jpeg", PIXEL),
		]);

		expect(stored).toHaveLength(2);
		expect(stored[0]?.artifactId?.value).not.toBe(stored[1]?.artifactId?.value);
	});

	it("writes the bytes and the type, so the image can be read back as it was sent", async () => {
		const storage = storageOf();
		const store = new AttachmentStore(storage);

		const stored = await store.store(SESSION, [MediaPart.image("image/png", PIXEL)]);
		const id = stored[0]?.artifactId;
		if (id === undefined) throw new Error("expected one id");
		const reference = await storage.find(SESSION, id);
		if (reference === undefined) throw new Error("expected the artifact to be readable");

		const content = await storage.read(SESSION, reference);
		expect(content.text).toBe(PIXEL);
		expect(content.mediaType).toBe("image/png");
	});

	it("writes nothing when there is nothing attached", async () => {
		expect(await new AttachmentStore(storageOf()).store(SESSION, [])).toEqual([]);
	});

	it("records a link as the address it already was, without writing anything", async () => {
		const storage = storageOf();
		const store = new AttachmentStore(storage);

		const stored = await store.store(SESSION, [MediaPart.link("https://cdn.example/x.png", "image/png")]);

		expect(stored[0]?.isLink).toBe(true);
		expect(stored[0]?.url).toBe("https://cdn.example/x.png");
		expect(stored[0]?.mediaType).toBe("image/png");
	});

	it("takes a link even when nothing can be written, because nothing has to be", async () => {
		const store = new AttachmentStore(new RefusingArtifactStorage());

		const stored = await store.store(SESSION, [MediaPart.link("https://cdn.example/x.png", "image/png")]);

		expect(stored[0]?.isLink).toBe(true);
	});

	it("ends the command when the storage refuses, because there is no inline fallback", async () => {
		const store = new AttachmentStore(new RefusingArtifactStorage());

		await expect(store.store(SESSION, [MediaPart.image("image/png", PIXEL)])).rejects.toBeInstanceOf(
			AttachmentNotStoredError,
		);
	});
});
