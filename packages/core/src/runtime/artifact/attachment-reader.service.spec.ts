import { describe, expect, it } from "vitest";
import { InMemoryArtifactStorage } from "../../adapters/storage/in-memory-artifact-storage.adapter";
import { ArtifactId } from "../../common/identity/artifact-id.value-object";
import { SessionId } from "../../common/identity/session-id.value-object";
import { SessionRevision } from "../../common/revision/session-revision.value-object";
import { AttachmentResolver } from "../../contracts/context/attachment-resolver.contract";
import { ArtifactContent } from "../../domain/artifact/artifact-content.value-object";
import type { ArtifactReference } from "../../domain/artifact/artifact-reference.value-object";
import { AttachmentProjection } from "../../domain/model/attachment/attachment-projection.value-object";
import { AttachmentReference } from "../../domain/model/attachment/attachment-reference.value-object";
import type { AttachmentRequest } from "../../domain/model/attachment/attachment-request.value-object";
import { SessionContext } from "../../domain/run/session-context.value-object";
import { SequenceIdGenerator } from "../../support/sequence-id-generator.double";
import { AttachmentReader } from "./attachment-reader.service";

const SESSION = SessionId.from("s-1");
const CTX = SessionContext.fromSessionId(SESSION);
const OTHER = SessionId.from("s-2");
const OTHER_CTX = SessionContext.fromSessionId(OTHER);
const PIXEL = "iVBORw0KGgo=";
const REVISION = SessionRevision.initial();

/** Counts what actually reached the storage, which is the only way to see the cache work. */
class CountingArtifactStorage extends InMemoryArtifactStorage {
	public reads = 0;

	public override async read(context: SessionContext, reference: ArtifactReference): Promise<ArtifactContent> {
		this.reads += 1;
		return super.read(context, reference);
	}
}

/** Answers a fixed projection and keeps every request it was asked about. */
class RecordingResolver extends AttachmentResolver {
	public readonly requests: AttachmentRequest[] = [];

	public constructor(private readonly answer: (request: AttachmentRequest) => Promise<AttachmentProjection>) {
		super();
	}

	public async resolve(_context: SessionContext, request: AttachmentRequest): Promise<AttachmentProjection> {
		this.requests.push(request);
		return this.answer(request);
	}
}

function storageOf(): CountingArtifactStorage {
	return new CountingArtifactStorage(new SequenceIdGenerator("a"));
}

async function put(storage: InMemoryArtifactStorage, context: SessionContext = CTX): Promise<AttachmentReference> {
	return AttachmentReference.artifact((await storage.put(context, ArtifactContent.of(PIXEL, "image/png"))).id);
}

function read(reader: AttachmentReader, references: readonly AttachmentReference[], context: SessionContext = CTX) {
	return reader.read(context, references, REVISION, true, false);
}

describe("AttachmentReader", () => {
	it("brings an attachment back as the part it was", async () => {
		const storage = storageOf();
		const reader = new AttachmentReader(storage);
		const id = await put(storage);

		const resolved = await read(reader, [id]);

		expect(resolved.media).toHaveLength(1);
		expect(resolved.media[0]?.mediaType).toBe("image/png");
		expect(resolved.media[0]?.base64).toBe(PIXEL);
		expect(resolved.notes).toEqual([]);
	});

	it("reads each image once, however many turns project the same journal", async () => {
		const storage = storageOf();
		const reader = new AttachmentReader(storage);
		const id = await put(storage);

		await read(reader, [id]);
		await read(reader, [id]);
		await read(reader, [id]);

		expect(storage.reads).toBe(1);
	});

	it("reads again after the conversation it cached for was forgotten", async () => {
		const storage = storageOf();
		const reader = new AttachmentReader(storage);
		const id = await put(storage);

		await read(reader, [id]);
		reader.forget(CTX);
		await read(reader, [id]);

		expect(storage.reads).toBe(2);
	});

	/** Forgetting one conversation is not a reason for every other one to pay for a read again. */
	it("keeps what it cached for the conversations it was not asked about", async () => {
		const storage = storageOf();
		const reader = new AttachmentReader(storage);
		const id = await put(storage);

		await read(reader, [id]);
		reader.forget(OTHER_CTX);
		await read(reader, [id]);

		expect(storage.reads).toBe(1);
	});

	it("never answers one session with another session's attachment", async () => {
		const storage = storageOf();
		const reader = new AttachmentReader(storage);
		const id = await put(storage, OTHER_CTX);

		expect((await read(reader, [id])).media).toEqual([]);
	});

	it("leaves out an attachment that no longer resolves, instead of ending the session", async () => {
		const reader = new AttachmentReader(storageOf());

		const resolved = await read(reader, [AttachmentReference.artifact(ArtifactId.from("a-404"))]);

		expect(resolved.media).toEqual([]);
		expect(resolved.notes).toEqual([]);
	});

	it("reads nothing when a message had nothing attached", async () => {
		const storage = storageOf();

		expect((await read(new AttachmentReader(storage), [])).media).toEqual([]);
		expect(storage.reads).toBe(0);
	});

	it("rebuilds a link without touching storage", async () => {
		const storage = storageOf();
		const reader = new AttachmentReader(storage);

		const resolved = await read(reader, [AttachmentReference.link("https://cdn.example/x.png", "image/png")]);

		expect(resolved.media[0]?.isRemote).toBe(true);
		expect(resolved.media[0]?.url).toBe("https://cdn.example/x.png");
		expect(storage.reads).toBe(0);
	});

	it("leaves out a link that no longer passes validation", async () => {
		const reader = new AttachmentReader(storageOf());

		const resolved = await read(reader, [AttachmentReference.link("https://cdn.example/x", "image/tiff")]);

		expect(resolved.media).toEqual([]);
	});

	it("keeps the order of the ids it was given", async () => {
		const storage = storageOf();
		const reader = new AttachmentReader(storage);
		const first = await put(storage);
		const second = AttachmentReference.artifact((await storage.put(CTX, ArtifactContent.of("aGk=", "image/jpeg"))).id);

		const resolved = await read(reader, [second, first]);

		expect(resolved.media.map((part) => part.mediaType)).toEqual(["image/jpeg", "image/png"]);
	});

	it("asks the resolver about every reference, with the position it sits at", async () => {
		const storage = storageOf();
		const resolver = new RecordingResolver(async () => AttachmentProjection.omit());
		const reader = new AttachmentReader(storage, resolver);
		const id = await put(storage);
		const external = AttachmentReference.external("file-7", "image/png");

		const resolved = await reader.read(CTX, [id, external], REVISION, true, true);

		expect(resolved.media).toEqual([]);
		expect(resolver.requests).toHaveLength(2);
		expect(resolver.requests[0]?.isCurrentRun).toBe(true);
		expect(resolver.requests[0]?.acceptsRemoteUrl).toBe(true);
		expect(resolver.requests[1]?.reference.externalId).toBe("file-7");
	});

	it("hands the resolver the runtime's own materialization through the request", async () => {
		const storage = storageOf();
		const resolver = new RecordingResolver(async (request) => {
			const part = await request.load();
			return part === undefined ? AttachmentProjection.omit() : AttachmentProjection.media(part);
		});
		const reader = new AttachmentReader(storage, resolver);
		const id = await put(storage);

		const resolved = await read(reader, [id]);

		expect(resolved.media[0]?.base64).toBe(PIXEL);
	});

	it("collects a note next to the media instead of in place of it", async () => {
		const storage = storageOf();
		const resolver = new RecordingResolver(async (request) =>
			request.reference.isExternal
				? AttachmentProjection.note("[attachment image/png: not this turn]")
				: AttachmentProjection.media((await request.load()) as never),
		);
		const reader = new AttachmentReader(storage, resolver);
		const id = await put(storage);

		const resolved = await read(reader, [id, AttachmentReference.external("file-7", "image/png")]);

		expect(resolved.media).toHaveLength(1);
		expect(resolved.notes).toEqual(["[attachment image/png: not this turn]"]);
	});

	it("turns a resolver that throws into a note, never into a dead turn", async () => {
		const resolver = new RecordingResolver(async () => {
			throw new Error("the bucket is down");
		});
		const reader = new AttachmentReader(storageOf(), resolver);

		const resolved = await read(reader, [AttachmentReference.external("file-7", "image/png")]);

		expect(resolved.media).toEqual([]);
		expect(resolved.notes).toEqual(["[attachment image/png: could not be resolved]"]);
	});

	it("never caches what the resolver produced, asking again on every projection", async () => {
		const storage = storageOf();
		let minted = 0;
		const resolver = new RecordingResolver(async (request) => {
			minted += 1;
			return AttachmentProjection.note(`[minted ${minted} for ${request.reference.externalId}]`);
		});
		const reader = new AttachmentReader(storage, resolver);
		const external = AttachmentReference.external("file-7", "image/png");

		await read(reader, [external]);
		const resolved = await read(reader, [external]);

		expect(resolved.notes).toEqual(["[minted 2 for file-7]"]);
	});

	it("still caches its own artifact fetch when a resolver is in front of it", async () => {
		const storage = storageOf();
		const resolver = new RecordingResolver(async (request) => {
			const part = await request.load();
			return part === undefined ? AttachmentProjection.omit() : AttachmentProjection.media(part);
		});
		const reader = new AttachmentReader(storage, resolver);
		const id = await put(storage);

		await read(reader, [id]);
		await read(reader, [id]);

		expect(storage.reads).toBe(1);
	});

	it("projects an external reference as a note when no resolver was declared", async () => {
		const reader = new AttachmentReader(storageOf());

		const resolved = await read(reader, [AttachmentReference.external("file-7", "image/png")]);

		expect(resolved.media).toEqual([]);
		expect(resolved.notes).toEqual(["[attachment image/png: no attachment resolver is configured]"]);
	});
});
