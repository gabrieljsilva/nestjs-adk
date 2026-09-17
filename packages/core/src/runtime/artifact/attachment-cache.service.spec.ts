import { describe, expect, it } from "vitest";
import { ArtifactId } from "../../common/identity/artifact-id.value-object";
import { SessionId } from "../../common/identity/session-id.value-object";
import { MediaPart } from "../../domain/model/messages/media-part.value-object";
import { AttachmentCache } from "./attachment-cache.service";

const SESSION = SessionId.from("s-1");
const OTHER = SessionId.from("s-2");

function partOf(bytes: number): MediaPart {
	return MediaPart.image("image/png", "A".repeat(bytes));
}

describe("AttachmentCache", () => {
	it("answers with nothing for an artifact it never held", () => {
		expect(new AttachmentCache().find(SESSION, ArtifactId.from("a-1"))).toBeUndefined();
	});

	it("answers with the part it was told to remember", () => {
		const cache = new AttachmentCache();
		const part = partOf(8);

		cache.remember(SESSION, ArtifactId.from("a-1"), part);

		expect(cache.find(SESSION, ArtifactId.from("a-1"))).toBe(part);
	});

	/** An id reissued in another conversation must never read the first one's bytes. */
	it("keeps conversations apart, even for the same artifact id", () => {
		const cache = new AttachmentCache();

		cache.remember(SESSION, ArtifactId.from("a-1"), partOf(8));

		expect(cache.find(OTHER, ArtifactId.from("a-1"))).toBeUndefined();
	});

	it("drops everything of one conversation and nothing of another", () => {
		const cache = new AttachmentCache();
		cache.remember(SESSION, ArtifactId.from("a-1"), partOf(8));
		cache.remember(OTHER, ArtifactId.from("a-2"), partOf(8));

		cache.forget(SESSION);

		expect(cache.find(SESSION, ArtifactId.from("a-1"))).toBeUndefined();
		expect(cache.find(OTHER, ArtifactId.from("a-2"))).toBeDefined();
	});

	it("evicts the oldest first when the next part would not fit", () => {
		const part = partOf(8);
		const cache = new AttachmentCache(part.encodedBytes * 2);
		cache.remember(SESSION, ArtifactId.from("a-1"), part);
		cache.remember(SESSION, ArtifactId.from("a-2"), part);

		cache.remember(SESSION, ArtifactId.from("a-3"), part);

		expect(cache.find(SESSION, ArtifactId.from("a-1"))).toBeUndefined();
		expect(cache.find(SESSION, ArtifactId.from("a-2"))).toBeDefined();
		expect(cache.find(SESSION, ArtifactId.from("a-3"))).toBeDefined();
	});

	it("does not keep a part larger than the whole budget, and evicts nothing for it", () => {
		const small = partOf(8);
		const cache = new AttachmentCache(small.encodedBytes);
		cache.remember(SESSION, ArtifactId.from("a-1"), small);

		cache.remember(SESSION, ArtifactId.from("a-2"), partOf(64));

		expect(cache.find(SESSION, ArtifactId.from("a-2"))).toBeUndefined();
		expect(cache.find(SESSION, ArtifactId.from("a-1"))).toBe(small);
	});

	/** Forgetting is what keeps the byte count honest; without it the budget only shrinks. */
	it("frees the budget of what it forgot", () => {
		const part = partOf(8);
		const cache = new AttachmentCache(part.encodedBytes);
		cache.remember(SESSION, ArtifactId.from("a-1"), part);

		cache.forget(SESSION);
		cache.remember(SESSION, ArtifactId.from("a-2"), part);

		expect(cache.find(SESSION, ArtifactId.from("a-2"))).toBe(part);
	});
});
