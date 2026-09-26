import { strict as assert } from "node:assert";
import { randomUUID } from "node:crypto";
import {
	ArtifactContent,
	ArtifactId,
	ArtifactName,
	ArtifactNotFoundError,
	ArtifactReference,
	type ArtifactStorage,
	ContractCase,
	ContractSuite,
	SessionContext,
	SessionId,
	TamperedArtifactReferenceError,
} from "@nestjs-adk/core";

const LARGE_CHARACTERS = 200_000;

/**
 * Every promise the `ArtifactStorage` port makes, as cases any runner drives, on the same terms
 * as the session one: `ContractCase` objects asserting with `node:assert`, and the same cases
 * the shipped stores answer.
 */
export class ArtifactStorageContractSuite extends ContractSuite<ArtifactStorage> {
	public readonly port = "ArtifactStorage";

	private readonly prefix = randomUUID().slice(0, 8);

	public cases(create: () => ArtifactStorage): ContractCase[] {
		return [
			new ContractCase("gives back exactly what it was given", async () => {
				const storage = create();
				const content = ArtifactContent.fromText("the whole report", "text/markdown");

				const reference = await storage.put(this.buildContext("s-1"), content);
				const read = await storage.read(this.buildContext("s-1"), reference);

				assert.equal(read.text, content.text, "an artifact that comes back changed is content nobody can trust");
				assert.equal(read.mediaType, "text/markdown", "what the content is travels with it or nothing can read it");
				assert.equal(reference.characters, content.characters, "the size is what a caller decides to read on");
				assert.equal(
					reference.sessionId.value,
					this.buildContext("s-1").sessionId.value,
					"a reference names the session it may be read under",
				);
			}),
			new ContractCase("resolves an id it holds, and answers nothing for one it does not", async () => {
				const storage = create();

				const reference = await storage.put(this.buildContext("s-1"), ArtifactContent.fromText("kept"));

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
				const reference = await storage.put(this.buildContext("s-1"), ArtifactContent.fromText("private"));

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
				const reference = await storage.put(this.buildContext("s-1"), ArtifactContent.fromText("the original"));
				const forged = await storage.put(this.buildContext("s-1"), ArtifactContent.fromText("something else"));

				const tampered = ArtifactReference.restore({
					id: forged.id,
					sessionId: this.buildContext("s-1").sessionId,
					digest: reference.digest,
					mediaType: reference.mediaType,
					characters: reference.characters,
				});

				await assert.rejects(
					() => storage.read(this.buildContext("s-1"), tampered),
					TamperedArtifactReferenceError,
					"a reference whose digest disagrees with the content must be refused, not followed",
				);
			}),
			new ContractCase("replaces what one artifact holds without moving it or renaming it", async () => {
				const storage = create();
				const older = await storage.put(this.buildContext("s-1"), ArtifactContent.fromText("written first"));
				const reference = await storage.put(this.buildContext("s-1"), ArtifactContent.fromText("the draft"));

				const updated = await storage.update(
					this.buildContext("s-1"),
					reference,
					ArtifactContent.fromText("the final text"),
				);
				const read = await storage.read(this.buildContext("s-1"), updated);
				const listed = await storage.list(this.buildContext("s-1"), 10);

				assert.equal(read.text, "the final text", "an update nobody can read back is a write that did not happen");
				assert.equal(updated.id.value, reference.id.value, "the id is in placeholders the conversation already wrote");
				assert.equal(updated.characters, "the final text".length, "the new size is what a caller decides to read on");
				assert.deepEqual(
					listed.map((entry) => entry.id.value),
					[reference.id.value, older.id.value],
					"an edited artifact keeps its place in the list, or every edit reorders the conversation's files",
				);
			}),
			new ContractCase("refuses an update arriving with a reference the content has moved past", async () => {
				const storage = create();
				const stale = await storage.put(this.buildContext("s-1"), ArtifactContent.fromText("the draft"));

				await storage.update(this.buildContext("s-1"), stale, ArtifactContent.fromText("edited by somebody else"));

				await assert.rejects(
					() => storage.update(this.buildContext("s-1"), stale, ArtifactContent.fromText("edited from what I read")),
					TamperedArtifactReferenceError,
					"a second writer holding the reference it read must be refused, not allowed to overwrite the first",
				);
				const current = await storage.find(this.buildContext("s-1"), stale.id);
				assert.ok(current !== undefined, "a refused update must leave the artifact where it was");
				assert.equal(
					(await storage.read(this.buildContext("s-1"), current)).text,
					"edited by somebody else",
					"and must leave the content the accepted write put there",
				);
			}),
			new ContractCase("does not let one session update another's, even with the right reference", async () => {
				const storage = create();
				const reference = await storage.put(this.buildContext("s-1"), ArtifactContent.fromText("private"));

				await assert.rejects(
					() => storage.update(this.buildContext("s-2"), reference, ArtifactContent.fromText("rewritten")),
					ArtifactNotFoundError,
					"writing is scoped like reading, and a reference from another conversation is not a way around it",
				);
				assert.equal(
					(await storage.read(this.buildContext("s-1"), reference)).text,
					"private",
					"a refused update must not have written anything",
				);
			}),
			new ContractCase("removes everything one session owns, and nothing anybody else's", async () => {
				const storage = create();
				const mine = await storage.put(this.buildContext("s-1"), ArtifactContent.fromText("mine"));
				const alsoMine = await storage.put(this.buildContext("s-1"), ArtifactContent.fromText("also mine"));
				const theirs = await storage.put(this.buildContext("s-2"), ArtifactContent.fromText("theirs"));

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
			new ContractCase("keeps the name it was given, because the placeholder shows it", async () => {
				const storage = create();
				const named = ArtifactContent.fromText("a,b\n1,2", "text/csv", ArtifactName.fromText("sales.csv"));

				const reference = await storage.put(this.buildContext("s-1"), named);
				const found = await storage.find(this.buildContext("s-1"), reference.id);
				const read = await storage.read(this.buildContext("s-1"), reference);

				assert.equal(reference.name?.value, "sales.csv", "the reference is how the model learns the name");
				assert.equal(found?.name?.value, "sales.csv", "a name that survives put but not find is a name nobody sees");
				assert.equal(read.name?.value, "sales.csv", "what comes out of read is what went into put, name included");
			}),
			new ContractCase("gives bytes back as bytes, never as text that happens to look like base64", async () => {
				const storage = create();
				const image = ArtifactContent.fromBytes(new Uint8Array([0x89, 0x50, 0x4e, 0x47]), "image/png");

				const reference = await storage.put(this.buildContext("s-1"), image);
				const read = await storage.read(this.buildContext("s-1"), reference);
				const found = await storage.find(this.buildContext("s-1"), reference.id);

				assert.equal(read.isText, false, "a store that forgets the encoding turns an image into a page of base64");
				assert.equal(read.base64, image.base64, "the bytes are the whole point");
				assert.equal(read.mediaType, "image/png", "what the bytes are travels with them");
				assert.equal(reference.isText, false, "the reference says what a tool may do with it");
				assert.equal(found?.isText, false, "and so does the one a lookup answers");
			}),
			new ContractCase("lists only what the session owns, newest first, up to the bound", async () => {
				const storage = create();
				const first = await storage.put(this.buildContext("s-1"), ArtifactContent.fromText("first"));
				const second = await storage.put(this.buildContext("s-1"), ArtifactContent.fromText("second"));
				await storage.put(this.buildContext("s-2"), ArtifactContent.fromText("theirs"));

				const listed = await storage.list(this.buildContext("s-1"), 10);
				const bounded = await storage.list(this.buildContext("s-1"), 1);

				assert.deepEqual(
					listed.map((reference) => reference.id.value),
					[second.id.value, first.id.value],
					"a list is what a model reads to know what it has, so it must be the session's own and the newest first",
				);
				assert.equal(bounded.length, 1, "a list read without a bound is an unbounded string on the way to a model");
				assert.equal(bounded[0]?.id.value, second.id.value, "the bound keeps the newest");
				assert.deepEqual(await storage.list(this.buildContext("s-never-used"), 10), [], "nothing owned is an empty list");
			}),
			new ContractCase("reads a range of what it holds, the same characters a full read would give", async () => {
				const storage = create();
				const reference = await storage.put(this.buildContext("s-1"), ArtifactContent.fromText("abcdefghij"));

				assert.equal(await storage.readRange(this.buildContext("s-1"), reference, 2, 3), "cde", "a range is a slice");
				assert.equal(
					await storage.readRange(this.buildContext("s-1"), reference, 8, 100),
					"ij",
					"a range past the end is cut, not refused",
				);
				await assert.rejects(
					() => storage.readRange(this.buildContext("s-2"), reference, 0, 3),
					ArtifactNotFoundError,
					"a range is scoped like a read",
				);
			}),
			new ContractCase("keeps a large artifact whole, which is the only kind there is", async () => {
				const storage = create();
				const long = ArtifactContent.fromText(buildLargeText(), "application/json");

				const reference = await storage.put(this.buildContext("s-1"), long);
				const read = await storage.read(this.buildContext("s-1"), reference);

				assert.equal(read.characters, LARGE_CHARACTERS, "a store that truncates is a store that loses the answer");
				assert.equal(read.text, long.text, "the point of an artifact is that it is too large to keep elsewhere");
			}),
		];
	}

	private buildContext(sessionId: string): SessionContext {
		return SessionContext.fromSessionId(SessionId.from(`${this.prefix}-${sessionId}`));
	}
}

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
