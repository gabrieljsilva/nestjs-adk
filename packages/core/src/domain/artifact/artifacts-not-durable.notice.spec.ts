import { describe, expect, it } from "vitest";
import { ArtifactsNotDurable } from "./artifacts-not-durable.notice";

describe("ArtifactsNotDurable", () => {
	it("names the storage to replace and the size that gets moved out", () => {
		const notice = new ArtifactsNotDurable("InMemoryArtifactStorage", 20_000);

		expect(notice.message).toContain("InMemoryArtifactStorage");
		expect(notice.message).toContain("20000 characters");
		expect(notice.message).toContain("SqliteArtifactStorage");
	});

	it("still says what the loss is when the policy decides on no size at all", () => {
		const notice = new ArtifactsNotDurable("InMemoryArtifactStorage");

		expect(notice.message).toContain("results are moved out of the context");
		expect(notice.thresholdCharacters).toBeUndefined();
	});
});
