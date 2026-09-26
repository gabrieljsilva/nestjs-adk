import { describe, expect, it } from "vitest";
import { ArtifactId } from "../../common/identity/artifact-id.value-object";
import { SessionId } from "../../common/identity/session-id.value-object";
import { ArtifactContent } from "../../domain/artifact/artifact-content.value-object";
import { ArtifactReference } from "../../domain/artifact/artifact-reference.value-object";
import { ArtifactNotFoundError } from "../../domain/artifact/errors/artifact-not-found.error";
import { TamperedArtifactReferenceError } from "../../domain/artifact/errors/tampered-artifact-reference.error";
import { SessionContext } from "../../domain/run/session-context.value-object";
import { SequenceIdGenerator } from "../../support/sequence-id-generator.double";
import { InMemoryArtifactStorage } from "./in-memory-artifact-storage.adapter";

const SESSION = SessionId.from("s-1");
const CTX = SessionContext.fromSessionId(SESSION);
const OTHER = SessionId.from("s-2");
const OTHER_CTX = SessionContext.fromSessionId(OTHER);
const content = ArtifactContent.fromText("a very long report", "text/markdown");

function storageOf(): InMemoryArtifactStorage {
	return new InMemoryArtifactStorage(new SequenceIdGenerator("a"));
}

describe("InMemoryArtifactStorage", () => {
	it("gives back a reference that fingerprints the exact content it was given", async () => {
		const storage = storageOf();

		const reference = await storage.put(CTX, content);

		expect(reference.matches(content)).toBe(true);
		expect(reference.characters).toBe(content.characters);
	});

	it("reads back exactly what was written", async () => {
		const storage = storageOf();
		const reference = await storage.put(CTX, content);

		const read = await storage.read(CTX, reference);

		expect(read.text).toBe(content.text);
		expect(read.mediaType).toBe("text/markdown");
	});

	it("answers a foreign session with absence, never with a refusal", async () => {
		const storage = storageOf();
		const reference = await storage.put(CTX, content);

		const error = await storage.read(OTHER_CTX, reference).catch((reason) => reason);

		expect(error).toBeInstanceOf(ArtifactNotFoundError);
	});

	it("keeps two sessions apart even when the ids would have collided", async () => {
		const storage = storageOf();
		const mine = await storage.put(CTX, content);
		await storage.put(OTHER_CTX, ArtifactContent.fromText("someone else's report"));

		expect((await storage.read(CTX, mine)).text).toBe(content.text);
	});

	it("refuses a reference whose fingerprint does not match what is stored", async () => {
		const storage = storageOf();
		const reference = await storage.put(CTX, content);
		const tampered = ArtifactReference.restore({
			id: reference.id,
			sessionId: SESSION,
			digest: ArtifactContent.fromText("a tampered report").digest(),
			mediaType: reference.mediaType,
			characters: reference.characters,
		});

		const error = await storage.read(CTX, tampered).catch((reason) => reason);

		expect(error).toBeInstanceOf(TamperedArtifactReferenceError);
	});

	it("reports an id it never stored as absent", async () => {
		const storage = storageOf();
		const unknown = ArtifactReference.fromContent(ArtifactId.from("never-written"), SESSION, content);

		await expect(storage.read(CTX, unknown)).rejects.toBeInstanceOf(ArtifactNotFoundError);
	});

	it("forgets everything one session owned, and nothing another one does", async () => {
		const storage = storageOf();
		const mine = await storage.put(CTX, content);
		const theirs = await storage.put(OTHER_CTX, content);

		await storage.deleteAll(CTX);

		await expect(storage.read(CTX, mine)).rejects.toBeInstanceOf(ArtifactNotFoundError);
		await expect(storage.read(OTHER_CTX, theirs)).resolves.toBeDefined();
	});

	it("deletes a session that owns nothing without complaining", async () => {
		await expect(storageOf().deleteAll(CTX)).resolves.toBeUndefined();
	});
});
