import { describe, expect, it } from "vitest";
import { InMemoryArtifactStorage } from "../../adapters/storage/in-memory-artifact-storage.adapter";
import { SessionId } from "../../common/identity/session-id.value-object";
import { ArtifactContent } from "../../domain/artifact/artifact-content.value-object";
import type { ArtifactReference } from "../../domain/artifact/artifact-reference.value-object";
import { ArtifactNotFoundError } from "../../domain/artifact/errors/artifact-not-found.error";
import { SessionContext } from "../../domain/run/session-context.value-object";
import { SequenceIdGenerator } from "../../support/sequence-id-generator.double";
import { ArtifactLoader, LoadedArtifact, LoadedRange } from "./artifact-loader.service";
import { ArtifactRefusal } from "./artifact-refusal.value-object";
import { ArtifactNotExplorableError } from "./errors/artifact-not-explorable.error";

const CTX = SessionContext.fromSessionId(SessionId.from("s-1"));
const OTHER = SessionContext.fromSessionId(SessionId.from("s-2"));

class CountingArtifactStorage extends InMemoryArtifactStorage {
	public reads = 0;

	public override async read(context: SessionContext, reference: ArtifactReference): Promise<ArtifactContent> {
		this.reads += 1;
		return super.read(context, reference);
	}

	public override async readRange(
		context: SessionContext,
		reference: ArtifactReference,
		offset: number,
		length: number,
	): Promise<string> {
		return (await super.read(context, reference)).text.slice(offset, offset + length);
	}
}

function loaderOf(): { loader: ArtifactLoader; storage: InMemoryArtifactStorage } {
	const storage = new InMemoryArtifactStorage(new SequenceIdGenerator("a"));
	return { loader: new ArtifactLoader(storage), storage };
}

describe("ArtifactLoader", () => {
	it("resolves an id into the content behind it, with the reference that named it", async () => {
		const { loader, storage } = loaderOf();
		const reference = await storage.put(CTX, ArtifactContent.fromText("the report", "text/markdown"));

		const loaded = await loader.loadOrFail(CTX, reference.id.value);

		expect(loaded.content.text).toBe("the report");
		expect(loaded.reference.mediaType).toBe("text/markdown");
	});

	it("refuses an id this conversation does not own, with no hint that it exists", async () => {
		const { loader, storage } = loaderOf();
		const reference = await storage.put(CTX, ArtifactContent.fromText("private"));

		await expect(loader.loadOrFail(OTHER, reference.id.value)).rejects.toBeInstanceOf(ArtifactNotFoundError);
	});

	it("refuses an id nobody ever wrote", async () => {
		await expect(loaderOf().loader.loadOrFail(CTX, "never-written")).rejects.toBeInstanceOf(ArtifactNotFoundError);
	});

	it("reads JSON out of whatever the content was declared as, because parsing is what decides", async () => {
		const { loader, storage } = loaderOf();
		const reference = await storage.put(CTX, ArtifactContent.fromText('{"total":349}', "text/plain"));

		expect(await (await loader.loadOrFail(CTX, reference.id.value)).readJsonOrFail()).toEqual({ total: 349 });
	});

	it("refuses bytes and an artifact over the ceiling without reading either, and loads the rest", async () => {
		const storage = new CountingArtifactStorage(new SequenceIdGenerator("a"));
		const loader = new ArtifactLoader(storage, 10);
		const image = await storage.put(CTX, ArtifactContent.fromBytes(new Uint8Array([1, 2]), "image/png"));
		const huge = await storage.put(CTX, ArtifactContent.fromText("x".repeat(11)));
		const small = await storage.put(CTX, ArtifactContent.fromText("x".repeat(10)));

		const refusedBytes = await loader.loadOrRefuse(CTX, image.id.value);
		const refusedSize = await loader.loadOrRefuse(CTX, huge.id.value);
		const loaded = await loader.loadOrRefuse(CTX, small.id.value);

		expect(refusedBytes).toBeInstanceOf(ArtifactRefusal);
		expect(String((refusedBytes as ArtifactRefusal).toResult().reason)).toContain("bytes");
		expect(refusedSize).toBeInstanceOf(ArtifactRefusal);
		expect(String((refusedSize as ArtifactRefusal).toResult().reason)).toContain("read_artifact(offset, limit)");
		expect(loaded).toBeInstanceOf(LoadedArtifact);
		expect(storage.reads).toBe(1);
	});

	it("reads a range without loading the whole artifact, whatever its size", async () => {
		const storage = new CountingArtifactStorage(new SequenceIdGenerator("a"));
		const loader = new ArtifactLoader(storage, 5);
		const reference = await storage.put(CTX, ArtifactContent.fromText("abcdefghij"));

		const range = await loader.loadRangeOrRefuse(CTX, reference.id.value, 2, 3);

		expect(range).toBeInstanceOf(LoadedRange);
		expect((range as LoadedRange).text).toBe("cde");
		expect((range as LoadedRange).offset).toBe(2);
		expect(storage.reads).toBe(0);
	});

	it("refuses to call something JSON because it was labelled JSON", async () => {
		const { loader, storage } = loaderOf();
		const reference = await storage.put(CTX, ArtifactContent.fromText("ERROR: not a document", "application/json"));
		const loaded = await loader.loadOrFail(CTX, reference.id.value);

		expect(() => loaded.readJsonOrFail()).toThrow(ArtifactNotExplorableError);
	});
});
