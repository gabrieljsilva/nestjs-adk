import { describe, expect, it } from "vitest";
import { InMemoryArtifactStorage } from "../../adapters/storage/in-memory-artifact-storage";
import { ArtifactId } from "../../common/identity/artifact-id";
import { SessionId } from "../../common/identity/session-id";
import { ArtifactContent } from "../../domain/artifact/artifact-content";
import type { ArtifactReference } from "../../domain/artifact/artifact-reference";
import { SequenceIdGenerator } from "../../support/sequence-id-generator";
import { AttachmentReader } from "./attachment-reader";

const SESSION = SessionId.from("s-1");
const OTHER = SessionId.from("s-2");
const PIXEL = "iVBORw0KGgo=";

/** Counts what actually reached the storage, which is the only way to see the cache work. */
class CountingArtifactStorage extends InMemoryArtifactStorage {
	public reads = 0;

	public override async read(sessionId: SessionId, reference: ArtifactReference): Promise<ArtifactContent> {
		this.reads += 1;
		return super.read(sessionId, reference);
	}
}

function storageOf(): CountingArtifactStorage {
	return new CountingArtifactStorage(new SequenceIdGenerator("a"));
}

async function put(storage: InMemoryArtifactStorage, sessionId: SessionId = SESSION): Promise<ArtifactId> {
	return (await storage.put(sessionId, ArtifactContent.of(PIXEL, "image/png"))).id;
}

describe("AttachmentReader", () => {
	it("brings an attachment back as the part it was", async () => {
		const storage = storageOf();
		const reader = new AttachmentReader(storage);
		const id = await put(storage);

		const parts = await reader.read(SESSION, [id]);

		expect(parts).toHaveLength(1);
		expect(parts[0]?.mediaType).toBe("image/png");
		expect(parts[0]?.base64).toBe(PIXEL);
	});

	it("reads each image once, however many turns project the same journal", async () => {
		const storage = storageOf();
		const reader = new AttachmentReader(storage);
		const id = await put(storage);

		await reader.read(SESSION, [id]);
		await reader.read(SESSION, [id]);
		await reader.read(SESSION, [id]);

		expect(storage.reads).toBe(1);
	});

	it("never answers one session with another session's attachment", async () => {
		const storage = storageOf();
		const reader = new AttachmentReader(storage);
		const id = await put(storage, OTHER);

		expect(await reader.read(SESSION, [id])).toEqual([]);
	});

	it("leaves out an attachment that no longer resolves, instead of ending the session", async () => {
		const reader = new AttachmentReader(storageOf());

		expect(await reader.read(SESSION, [ArtifactId.from("a-404")])).toEqual([]);
	});

	it("reads nothing when a message had nothing attached", async () => {
		const storage = storageOf();

		expect(await new AttachmentReader(storage).read(SESSION, [])).toEqual([]);
		expect(storage.reads).toBe(0);
	});

	it("keeps the order of the ids it was given", async () => {
		const storage = storageOf();
		const reader = new AttachmentReader(storage);
		const first = await put(storage);
		const second = (await storage.put(SESSION, ArtifactContent.of("aGk=", "image/jpeg"))).id;

		const parts = await reader.read(SESSION, [second, first]);

		expect(parts.map((part) => part.mediaType)).toEqual(["image/jpeg", "image/png"]);
	});
});
