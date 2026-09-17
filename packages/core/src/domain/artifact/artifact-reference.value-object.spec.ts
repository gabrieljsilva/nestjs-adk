import { describe, expect, it } from "vitest";
import { ArtifactId } from "../../common/identity/artifact-id.value-object";
import { SessionId } from "../../common/identity/session-id.value-object";
import { ArtifactContent } from "./artifact-content.value-object";
import { ArtifactReference } from "./artifact-reference.value-object";
import { OffloadDecision } from "./offload-decision.value-object";

const ID = ArtifactId.from("a-1");
const SESSION = SessionId.from("s-1");
const content = new ArtifactContent("a very long report", "text/markdown");

describe("ArtifactReference", () => {
	it("describes the content it stands for without carrying it", () => {
		const reference = ArtifactReference.fromContent(ID, SESSION, content);

		expect(reference.characters).toBe(content.characters);
		expect(reference.mediaType).toBe("text/markdown");
		expect(Object.values(reference)).not.toContain(content.text);
	});

	it("belongs to the session that produced it, and to no other", () => {
		const reference = ArtifactReference.fromContent(ID, SESSION, content);

		expect(reference.belongsTo(SESSION)).toBe(true);
		expect(reference.belongsTo(SessionId.from("s-2"))).toBe(false);
	});

	it("recognizes the content it was built from", () => {
		expect(ArtifactReference.fromContent(ID, SESSION, content).matches(new ArtifactContent("a very long report"))).toBe(
			true,
		);
	});

	it("offers the exploration tools only for content they can parse", () => {
		const reference = ArtifactReference.fromContent(ID, SESSION, content);

		expect(reference.toString(OffloadDecision.EXPLORABLE)).toContain("outline_artifact");
		expect(reference.toString(OffloadDecision.EXPLORABLE)).toContain("query_artifact");
		expect(reference.toString(OffloadDecision.OPAQUE)).not.toContain("outline_artifact");
		expect(reference.toString(OffloadDecision.OPAQUE)).toContain("read_artifact");
	});

	it("refuses content that is not what it fingerprinted", () => {
		expect(ArtifactReference.fromContent(ID, SESSION, content).matches(new ArtifactContent("a tampered report"))).toBe(
			false,
		);
	});

	it("reads as a placeholder the model can act on", () => {
		expect(ArtifactReference.fromContent(ID, SESSION, content).toString()).toBe(
			"[artifact a-1, text/markdown, 18 characters, read with read_artifact(artifactId, offset, limit)]",
		);
	});

	it("comes back from storage with the fingerprint it was stored with", () => {
		const restored = ArtifactReference.restore(ID, SESSION, content.digest(), "text/markdown", 18);

		expect(restored.matches(content)).toBe(true);
	});
});
