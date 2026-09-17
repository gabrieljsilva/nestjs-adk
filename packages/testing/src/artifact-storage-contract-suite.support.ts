import { strict as assert } from "node:assert";
import {
	ArtifactContent,
	ArtifactId,
	ArtifactNotFoundError,
	ArtifactReference,
	type ArtifactStorage,
	ContractCase,
	ContractSuite,
	SessionContext,
	SessionId,
	TamperedArtifactReferenceError,
} from "@nestjs-adk/core";

/** Large enough that a driver that truncates a column, or a store that pages, is caught by it. */
const LARGE_CHARACTERS = 200_000;

/**
 * Every promise the `ArtifactStorage` port makes, as cases any adapter has to answer.
 *
 * Two guarantees define a correct adapter and both are checked from the outside, through
 * the port alone: what comes out of `read` is what went into `put`, verified against the
 * digest the reference carries, and a session only ever reads its own, with anything else
 * answered as absent rather than refused, because an id is guessable and a refusal confirms
 * it exists.
 *
 * There is no capability declaration here, unlike `SessionStorageContractSuite`. Every
 * artifact store promises the same two things: an ephemeral one keeps them for as long as
 * the process lives and a durable one keeps them longer, and that difference is visible to
 * nobody holding the port.
 *
 * Like the session suite, it holds nothing an implementer could not hold. It builds its
 * contexts through `SessionContext.fromSessionId` and its content through `ArtifactContent`,
 * both published, and it never constructs a reference: a reference is what `put` answered,
 * which is the only way anybody outside a storage gets one.
 */
export class ArtifactStorageContractSuite extends ContractSuite<ArtifactStorage> {
	public readonly port = "ArtifactStorage";

	public cases(create: () => ArtifactStorage): ContractCase[] {
		return [
			new ContractCase("gives back exactly what it was given", async () => {
				const storage = create();
				const content = new ArtifactContent("the whole report", "text/markdown");

				const reference = await storage.put(this.buildContext("s-1"), content);
				const read = await storage.read(this.buildContext("s-1"), reference);

				assert.equal(read.text, content.text, "an artifact that comes back changed is content nobody can trust");
				assert.equal(read.mediaType, "text/markdown", "what the content is travels with it or nothing can read it");
				assert.equal(reference.characters, content.characters, "the size is what a caller decides to read on");
				assert.equal(reference.sessionId.value, "s-1", "a reference names the session it may be read under");
			}),
			new ContractCase("resolves an id it holds, and answers nothing for one it does not", async () => {
				const storage = create();

				const reference = await storage.put(this.buildContext("s-1"), new ArtifactContent("kept"));

				const found = await storage.find(this.buildContext("s-1"), reference.id);
				assert.ok(found !== undefined, "an id a model was shown must resolve inside the session it was shown in");
				assert.equal(found.id.value, reference.id.value, "resolving an id must answer the artifact it names");
				assert.equal(
					await storage.find(this.buildContext("s-1"), ArtifactId.from("never-written")),
					undefined,
					"an unknown id is absence, not a failure: a model asking about one is ordinary traffic",
				);
			}),
			new ContractCase("does not let one session read another's, even with the right id", async () => {
				const storage = create();
				const reference = await storage.put(this.buildContext("s-1"), new ArtifactContent("private"));

				assert.equal(
					await storage.find(this.buildContext("s-2"), reference.id),
					undefined,
					"an id is guessable, so another session must miss rather than be refused",
				);
				await assert.rejects(
					() => storage.read(this.buildContext("s-2"), reference),
					ArtifactNotFoundError,
					"reading with a reference from another conversation must not be a way around the scope",
				);
			}),
			new ContractCase("refuses content that no longer hashes to the reference it was handed", async () => {
				const storage = create();
				const reference = await storage.put(this.buildContext("s-1"), new ArtifactContent("the original"));
				const forged = await storage.put(this.buildContext("s-1"), new ArtifactContent("something else"));

				// A reference built the way an adapter builds one, pointing at the second artifact
				// while carrying the digest of the first: exactly what a model rewriting a
				// placeholder produces.
				const tampered = ArtifactReference.restore(
					forged.id,
					SessionId.from("s-1"),
					reference.digest,
					reference.mediaType,
					reference.characters,
				);

				await assert.rejects(
					() => storage.read(this.buildContext("s-1"), tampered),
					TamperedArtifactReferenceError,
					"a reference whose digest disagrees with the content must be refused, not followed",
				);
			}),
			new ContractCase("removes everything one session owns, and nothing anybody else's", async () => {
				const storage = create();
				const mine = await storage.put(this.buildContext("s-1"), new ArtifactContent("mine"));
				const alsoMine = await storage.put(this.buildContext("s-1"), new ArtifactContent("also mine"));
				const theirs = await storage.put(this.buildContext("s-2"), new ArtifactContent("theirs"));

				await storage.deleteAll(this.buildContext("s-1"));

				assert.equal(await storage.find(this.buildContext("s-1"), mine.id), undefined, "a deleted artifact is gone");
				assert.equal(await storage.find(this.buildContext("s-1"), alsoMine.id), undefined, "every one of them is gone");
				assert.ok(
					(await storage.find(this.buildContext("s-2"), theirs.id)) !== undefined,
					"deleting a conversation must not reach into another one",
				);
			}),
			new ContractCase("deletes a session that owns nothing without complaining", async () => {
				const storage = create();

				await storage.deleteAll(this.buildContext("s-never-used"));
			}),
			new ContractCase("keeps a large artifact whole, which is the only kind there is", async () => {
				const storage = create();
				const long = new ArtifactContent(buildLargeText(), "application/json");

				const reference = await storage.put(this.buildContext("s-1"), long);
				const read = await storage.read(this.buildContext("s-1"), reference);

				assert.equal(read.characters, LARGE_CHARACTERS, "a store that truncates is a store that loses the answer");
				assert.equal(read.text, long.text, "the point of an artifact is that it is too large to keep elsewhere");
			}),
		];
	}

	/** The same way an application builds one, because the suite may hold nothing an implementer could not. */
	private buildContext(sessionId: string): SessionContext {
		return SessionContext.fromSessionId(SessionId.from(sessionId));
	}
}

/** Text a compressor cannot collapse, so a column that truncates is caught rather than hidden. */
function buildLargeText(): string {
	const parts: string[] = [];
	let written = 0;
	for (let at = 0; written < LARGE_CHARACTERS; at += 1) {
		const row = `{"row":${at},"value":"${at * 7919}"}\n`;
		parts.push(row);
		written += row.length;
	}
	return parts.join("").slice(0, LARGE_CHARACTERS);
}
