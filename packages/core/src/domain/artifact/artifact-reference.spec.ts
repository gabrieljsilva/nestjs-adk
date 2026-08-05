import { describe, expect, it } from "vitest";
import { ArtifactId } from "../../common/identity/artifact-id";
import { SessionId } from "../../common/identity/session-id";
import { ArtifactContent } from "./artifact-content";
import { ArtifactReference } from "./artifact-reference";

const ID = ArtifactId.from("a-1");
const SESSION = SessionId.from("s-1");
const content = ArtifactContent.of("a very long report", "text/markdown");

describe("ArtifactReference", () => {
	it("describes the content it stands for without carrying it", () => {
		const reference = ArtifactReference.of(ID, SESSION, content);

		expect(reference.characters).toBe(content.characters);
		expect(reference.mediaType).toBe("text/markdown");
		expect(Object.values(reference)).not.toContain(content.text);
	});

	it("belongs to the session that produced it, and to no other", () => {
		const reference = ArtifactReference.of(ID, SESSION, content);

		expect(reference.belongsTo(SESSION)).toBe(true);
		expect(reference.belongsTo(SessionId.from("s-2"))).toBe(false);
	});

	it("recognizes the content it was built from", () => {
		expect(ArtifactReference.of(ID, SESSION, content).matches(ArtifactContent.of("a very long report"))).toBe(true);
	});

	it("refuses content that is not what it fingerprinted", () => {
		expect(ArtifactReference.of(ID, SESSION, content).matches(ArtifactContent.of("a tampered report"))).toBe(false);
	});

	it("reads as a placeholder the model can act on", () => {
		expect(ArtifactReference.of(ID, SESSION, content).toString()).toBe("[artifact a-1, text/markdown, 18 characters]");
	});

	it("comes back from storage with the fingerprint it was stored with", () => {
		const restored = ArtifactReference.restore(ID, SESSION, content.digest(), "text/markdown", 18);

		expect(restored.matches(content)).toBe(true);
	});
});
