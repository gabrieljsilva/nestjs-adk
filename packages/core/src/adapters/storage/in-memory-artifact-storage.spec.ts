import { describe, expect, it } from "vitest";
import { ArtifactId } from "../../common/identity/artifact-id";
import { SessionId } from "../../common/identity/session-id";
import { ArtifactContent } from "../../domain/artifact/artifact-content";
import { ArtifactReference } from "../../domain/artifact/artifact-reference";
import { ArtifactNotFoundError } from "../../domain/artifact/errors/artifact-not-found.error";
import { TamperedArtifactReferenceError } from "../../domain/artifact/errors/tampered-artifact-reference.error";
import { SequenceIdGenerator } from "../../support/sequence-id-generator";
import { InMemoryArtifactStorage } from "./in-memory-artifact-storage";

const SESSION = SessionId.from("s-1");
const OTHER = SessionId.from("s-2");
const content = ArtifactContent.of("a very long report", "text/markdown");

function storageOf(): InMemoryArtifactStorage {
	return new InMemoryArtifactStorage(new SequenceIdGenerator("a"));
}

describe("InMemoryArtifactStorage", () => {
	it("gives back a reference that fingerprints the exact content it was given", async () => {
		const storage = storageOf();

		const reference = await storage.put(SESSION, content);

		expect(reference.matches(content)).toBe(true);
		expect(reference.characters).toBe(content.characters);
	});

	it("reads back exactly what was written", async () => {
		const storage = storageOf();
		const reference = await storage.put(SESSION, content);

		const read = await storage.read(SESSION, reference);

		expect(read.text).toBe(content.text);
		expect(read.mediaType).toBe("text/markdown");
	});

	it("answers a foreign session with absence, never with a refusal", async () => {
		const storage = storageOf();
		const reference = await storage.put(SESSION, content);

		const error = await storage.read(OTHER, reference).catch((reason) => reason);

		expect(error).toBeInstanceOf(ArtifactNotFoundError);
	});

	it("keeps two sessions apart even when the ids would have collided", async () => {
		const storage = storageOf();
		const mine = await storage.put(SESSION, content);
		await storage.put(OTHER, ArtifactContent.of("someone else's report"));

		expect((await storage.read(SESSION, mine)).text).toBe(content.text);
	});

	it("refuses a reference whose fingerprint does not match what is stored", async () => {
		const storage = storageOf();
		const reference = await storage.put(SESSION, content);
		const tampered = ArtifactReference.restore(
			reference.id,
			SESSION,
			ArtifactContent.of("a tampered report").digest(),
			reference.mediaType,
			reference.characters,
		);

		const error = await storage.read(SESSION, tampered).catch((reason) => reason);

		expect(error).toBeInstanceOf(TamperedArtifactReferenceError);
	});

	it("reports an id it never stored as absent", async () => {
		const storage = storageOf();
		const unknown = ArtifactReference.of(ArtifactId.from("never-written"), SESSION, content);

		await expect(storage.read(SESSION, unknown)).rejects.toBeInstanceOf(ArtifactNotFoundError);
	});

	it("forgets everything one session owned, and nothing another one does", async () => {
		const storage = storageOf();
		const mine = await storage.put(SESSION, content);
		const theirs = await storage.put(OTHER, content);

		await storage.deleteAll(SESSION);

		await expect(storage.read(SESSION, mine)).rejects.toBeInstanceOf(ArtifactNotFoundError);
		await expect(storage.read(OTHER, theirs)).resolves.toBeDefined();
	});

	it("deletes a session that owns nothing without complaining", async () => {
		await expect(storageOf().deleteAll(SESSION)).resolves.toBeUndefined();
	});
});
