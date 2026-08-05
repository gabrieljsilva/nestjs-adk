import { describe, expect, it } from "vitest";
import { ArtifactContent } from "./artifact-content";

describe("ArtifactContent", () => {
	it("keeps the text exactly as it was given", () => {
		expect(ArtifactContent.of("  spaced  ").text).toBe("  spaced  ");
	});

	it("defaults to plain text and normalizes the media type it was told", () => {
		expect(ArtifactContent.of("x").mediaType).toBe("text/plain");
		expect(ArtifactContent.of("x", " Application/JSON ").mediaType).toBe("application/json");
	});

	it("measures itself in characters, which is what a context budget counts", () => {
		expect(ArtifactContent.of("hello").characters).toBe(5);
	});

	it("digests the exact content, so the same text always fingerprints the same way", () => {
		expect(ArtifactContent.of("hello").digest().equals(ArtifactContent.of("hello").digest())).toBe(true);
	});

	it("digests a single changed character differently", () => {
		expect(ArtifactContent.of("hello").digest().equals(ArtifactContent.of("hellO").digest())).toBe(false);
	});

	it("names the algorithm that produced the fingerprint", () => {
		expect(ArtifactContent.of("hello").digest().algorithm).toBe("sha256");
	});
});
