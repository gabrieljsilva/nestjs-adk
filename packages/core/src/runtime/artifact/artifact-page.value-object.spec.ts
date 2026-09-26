import { describe, expect, it } from "vitest";
import { ArtifactId } from "../../common/identity/artifact-id.value-object";
import { SessionId } from "../../common/identity/session-id.value-object";
import { ArtifactContent } from "../../domain/artifact/artifact-content.value-object";
import { ArtifactReference } from "../../domain/artifact/artifact-reference.value-object";
import { ArtifactPage } from "./artifact-page.value-object";

const content = ArtifactContent.fromText("abcdefghij", "text/plain");
const document = ArtifactContent.fromText("alpha\nbeta\ngamma", "text/plain");
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

	it("takes the first line it was asked for whole, whatever room it was given, so a page is never half a line", () => {
		const page = ArtifactPage.fromLines(document, 1, 3, 2);

		expect(page.text).toBe("alpha");
		expect(page.lineCount).toBe(1);
		expect(page.offset).toBe(0);
	});

	it("reports where the line it read starts, which is what a page too small for that line is anchored on", () => {
		expect(ArtifactPage.fromLines(document, 1, 1, 100).offset).toBe(0);
		expect(ArtifactPage.fromLines(document, 2, 1, 100).offset).toBe(6);
		expect(ArtifactPage.fromLines(document, 3, 5, 100).offset).toBe(11);
		expect(ArtifactPage.fromLines(document, 9, 5, 100).offset).toBe(16);
	});

	it("anchors a character page where a line starts, so a line too long to page is still read from its beginning", () => {
		const page = ArtifactPage.fromLineStart(document, 2, 4);

		expect(page.text).toBe("beta");
		expect(page.offset).toBe(6);
		expect(page.totalCharacters).toBe(16);
		expect(page.hasMore).toBe(true);
	});

	it("says nothing about lines when it is anchored on one, because a page cut inside a line makes a line count a lie", () => {
		const result = ArtifactPage.fromLineStart(document, 3, 3).toResult(reference);

		expect(result.text).toBe("gam");
		expect(result.offset).toBe(11);
		expect(result.nextOffset).toBe(14);
		expect(result.fromLine).toBeUndefined();
		expect(result.lines).toBeUndefined();
		expect(result.totalLines).toBeUndefined();
		expect(result.nextLine).toBeUndefined();
	});

	it("anchors at the end for a line past the end, so the answer is an empty page rather than a wrong one", () => {
		const page = ArtifactPage.fromLineStart(document, 9, 5);

		expect(page.text).toBe("");
		expect(page.offset).toBe(16);
		expect(page.hasMore).toBe(false);
	});

	it("counts a line offset in the characters the page is sliced with, so content outside ASCII does not drift", () => {
		const emoji = ArtifactContent.fromText("🚀🚀\nsecond", "text/plain");

		const page = ArtifactPage.fromLineStart(emoji, 2, 6);

		expect(page.offset).toBe(5);
		expect(page.text).toBe("second");
		expect(ArtifactPage.fromLines(emoji, 2, 1, 100).offset).toBe(5);
	});

	it("falls back to a page somebody can read when the policy declares no threshold", () => {
		expect(ArtifactPage.resolveDefaultLimit(undefined)).toBe(20_000);
		expect(ArtifactPage.resolveDefaultLimit(0)).toBe(20_000);
		expect(ArtifactPage.resolveDefaultLimit(750)).toBe(750);
	});
});
