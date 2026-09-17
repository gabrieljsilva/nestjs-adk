import { describe, expect, it } from "vitest";
import { InMemoryArtifactStorage } from "../../adapters/storage/in-memory-artifact-storage.adapter";
import { SessionId } from "../../common/identity/session-id.value-object";
import { ArtifactContent } from "../../domain/artifact/artifact-content.value-object";
import { ArtifactNotFoundError } from "../../domain/artifact/errors/artifact-not-found.error";
import { SessionContext } from "../../domain/run/session-context.value-object";
import { SequenceIdGenerator } from "../../support/sequence-id-generator.double";
import { ArtifactLoader } from "./artifact-loader.service";
import { ArtifactNotExplorableError } from "./errors/artifact-not-explorable.error";

const CTX = SessionContext.fromSessionId(SessionId.from("s-1"));
const OTHER = SessionContext.fromSessionId(SessionId.from("s-2"));

function loaderOf(): { loader: ArtifactLoader; storage: InMemoryArtifactStorage } {
	const storage = new InMemoryArtifactStorage(new SequenceIdGenerator("a"));
	return { loader: new ArtifactLoader(storage), storage };
}

describe("ArtifactLoader", () => {
	it("resolves an id into the content behind it, with the reference that named it", async () => {
		const { loader, storage } = loaderOf();
		const reference = await storage.put(CTX, new ArtifactContent("the report", "text/markdown"));

		const loaded = await loader.loadOrFail(CTX, reference.id.value);

		expect(loaded.content.text).toBe("the report");
		expect(loaded.reference.mediaType).toBe("text/markdown");
	});

	it("refuses an id this conversation does not own, with no hint that it exists", async () => {
		const { loader, storage } = loaderOf();
		const reference = await storage.put(CTX, new ArtifactContent("private"));

		await expect(loader.loadOrFail(OTHER, reference.id.value)).rejects.toBeInstanceOf(ArtifactNotFoundError);
	});

	it("refuses an id nobody ever wrote", async () => {
		await expect(loaderOf().loader.loadOrFail(CTX, "never-written")).rejects.toBeInstanceOf(ArtifactNotFoundError);
	});

	it("reads JSON out of whatever the content was declared as, because parsing is what decides", async () => {
		const { loader, storage } = loaderOf();
		const reference = await storage.put(CTX, new ArtifactContent('{"total":349}', "text/plain"));

		expect(await (await loader.loadOrFail(CTX, reference.id.value)).readJsonOrFail()).toEqual({ total: 349 });
	});

	it("refuses to call something JSON because it was labelled JSON", async () => {
		const { loader, storage } = loaderOf();
		const reference = await storage.put(CTX, new ArtifactContent("ERROR: not a document", "application/json"));
		const loaded = await loader.loadOrFail(CTX, reference.id.value);

		expect(() => loaded.readJsonOrFail()).toThrow(ArtifactNotExplorableError);
	});
});
