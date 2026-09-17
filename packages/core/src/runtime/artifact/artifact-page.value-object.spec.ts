import { describe, expect, it } from "vitest";
import { ArtifactId } from "../../common/identity/artifact-id.value-object";
import { SessionId } from "../../common/identity/session-id.value-object";
import { ArtifactContent } from "../../domain/artifact/artifact-content.value-object";
import { ArtifactReference } from "../../domain/artifact/artifact-reference.value-object";
import { ArtifactPage } from "./artifact-page.value-object";

const content = new ArtifactContent("abcdefghij", "text/plain");
const reference = ArtifactReference.fromContent(ArtifactId.from("a-1"), SessionId.from("s-1"), content);

describe("ArtifactPage", () => {
	it("takes the window it was asked for", () => {
		const page = ArtifactPage.fromContent(content, 2, 3);

		expect(page.text).toBe("cde");
		expect(page.offset).toBe(2);
		expect(page.totalCharacters).toBe(10);
		expect(page.hasMore).toBe(true);
	});

	it("knows when there is nothing after it", () => {
		expect(ArtifactPage.fromContent(content, 0, 10).hasMore).toBe(false);
		expect(ArtifactPage.fromContent(content, 5, 99).hasMore).toBe(false);
	});

	it("answers an offset past the end as an empty page rather than a failure", () => {
		const page = ArtifactPage.fromContent(content, 400, 10);

		expect(page.text).toBe("");
		expect(page.offset).toBe(10);
		expect(page.hasMore).toBe(false);
	});

	it("reads a window nobody could have meant as the nearest one somebody could", () => {
		expect(ArtifactPage.fromContent(content, -5, 3).offset).toBe(0);
		expect(ArtifactPage.fromContent(content, 0, -3).text).toBe("");
	});

	it("hands back where the next page starts, and nothing when there is none", () => {
		expect(ArtifactPage.fromContent(content, 0, 4).toResult(reference).nextOffset).toBe(4);
		expect(ArtifactPage.fromContent(content, 0, 40).toResult(reference).nextOffset).toBeUndefined();
	});

	it("names the artifact and what it is, so a page stands on its own in the conversation", () => {
		const result = ArtifactPage.fromContent(content, 0, 4).toResult(reference);

		expect(result.artifactId).toBe("a-1");
		expect(result.mediaType).toBe("text/plain");
		expect(result.totalCharacters).toBe(10);
	});

	it("falls back to a page somebody can read when the policy declares no threshold", () => {
		expect(ArtifactPage.resolveDefaultLimit(undefined)).toBe(20_000);
		expect(ArtifactPage.resolveDefaultLimit(0)).toBe(20_000);
		expect(ArtifactPage.resolveDefaultLimit(750)).toBe(750);
	});
});
