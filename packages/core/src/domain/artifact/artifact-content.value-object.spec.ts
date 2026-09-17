import { describe, expect, it } from "vitest";
import { ArtifactContent } from "./artifact-content.value-object";

describe("ArtifactContent", () => {
	it("keeps the text exactly as it was given", () => {
		expect(new ArtifactContent("  spaced  ").text).toBe("  spaced  ");
	});

	it("defaults to plain text and normalizes the media type it was told", () => {
		expect(new ArtifactContent("x").mediaType).toBe("text/plain");
		expect(new ArtifactContent("x", " Application/JSON ").mediaType).toBe("application/json");
	});

	it("measures itself in characters, which is what a context budget counts", () => {
		expect(new ArtifactContent("hello").characters).toBe(5);
	});

	it("digests the exact content, so the same text always fingerprints the same way", () => {
		expect(new ArtifactContent("hello").digest().equals(new ArtifactContent("hello").digest())).toBe(true);
	});

	it("digests a single changed character differently", () => {
		expect(new ArtifactContent("hello").digest().equals(new ArtifactContent("hellO").digest())).toBe(false);
	});

	it("names the algorithm that produced the fingerprint", () => {
		expect(new ArtifactContent("hello").digest().algorithm).toBe("sha256");
	});
});
