import { describe, expect, it } from "vitest";
import { InMemoryArtifactStorage } from "../../adapters/storage/in-memory-artifact-storage";
import { SessionId } from "../../common/identity/session-id";
import { ArtifactStorage } from "../../contracts/artifact-storage";
import type { ArtifactContent } from "../../domain/artifact/artifact-content";
import type { ArtifactReference } from "../../domain/artifact/artifact-reference";
import { OffloadPolicy } from "../../domain/artifact/offload-policy";
import { SequenceIdGenerator } from "../../support/sequence-id-generator";
import { ArtifactOffloader } from "./artifact-offloader";

const SESSION = SessionId.from("s-1");

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

describe("ArtifactOffloader", () => {
	it("leaves a result that fits exactly where it was", async () => {
		const offloader = new ArtifactOffloader(storageOf(), OffloadPolicy.above(10));

		const result = await offloader.offload(SESSION, "short");

		expect(result.wasOffloaded).toBe(false);
		expect(result.text).toBe("short");
	});

	it("moves a result that does not fit, and answers with a placeholder", async () => {
		const offloader = new ArtifactOffloader(storageOf(), OffloadPolicy.above(10));

		const result = await offloader.offload(SESSION, "a report far longer than the threshold");

		expect(result.wasOffloaded).toBe(true);
		expect(result.text).toContain("artifact");
		expect(result.text).not.toContain("report");
	});

	it("stores the content whole, so asking for it back returns what the tool produced", async () => {
		const storage = storageOf();
		const offloader = new ArtifactOffloader(storage, OffloadPolicy.above(10));
		const original = "a report far longer than the threshold";

		const result = await offloader.offload(SESSION, original);
		const reference = result.reference;
		if (reference === undefined) throw new Error("expected the result to have been offloaded");

		expect((await storage.read(SESSION, reference)).text).toBe(original);
	});

	it("keeps the media type the caller declared", async () => {
		const storage = storageOf();
		const offloader = new ArtifactOffloader(storage, OffloadPolicy.above(5));

		const result = await offloader.offload(SESSION, '{"items":[1,2,3]}', "application/json");

		expect(result.reference?.mediaType).toBe("application/json");
	});

	it("moves nothing when the application disabled offload", async () => {
		const offloader = new ArtifactOffloader(storageOf(), OffloadPolicy.disabled());

		expect((await offloader.offload(SESSION, "x".repeat(100_000))).wasOffloaded).toBe(false);
	});

	it("keeps the result in the context when the storage refuses it", async () => {
		const offloader = new ArtifactOffloader(new RefusingArtifactStorage(), OffloadPolicy.above(1));

		const result = await offloader.offload(SESSION, "a long enough result");

		expect(result.wasOffloaded).toBe(false);
		expect(result.text).toBe("a long enough result");
	});

	it("uses the default threshold when the application chose none", async () => {
		const offloader = new ArtifactOffloader(storageOf());

		expect((await offloader.offload(SESSION, "x".repeat(OffloadPolicy.DEFAULT_THRESHOLD))).wasOffloaded).toBe(false);
		expect((await offloader.offload(SESSION, "x".repeat(OffloadPolicy.DEFAULT_THRESHOLD + 1))).wasOffloaded).toBe(true);
	});
});
