import { describe, expect, it } from "vitest";
import { ArtifactId } from "../../common/identity/artifact-id.value-object";
import { SessionId } from "../../common/identity/session-id.value-object";
import { ArtifactContent } from "./artifact-content.value-object";
import { ArtifactName } from "./artifact-name.value-object";
import { ArtifactReference } from "./artifact-reference.value-object";
import { OffloadDecision } from "./offload-decision.value-object";

const ID = ArtifactId.from("a-1");
const SESSION = SessionId.from("s-1");
const content = ArtifactContent.fromText("a very long report", "text/markdown");

describe("ArtifactReference", () => {
	it("describes the content it stands for without carrying it", () => {
		const reference = ArtifactReference.fromContent(ID, SESSION, content);

		expect(reference.characters).toBe(content.characters);
		expect(reference.mediaType).toBe("text/markdown");
		expect(reference.isText).toBe(true);
		expect(Object.values(reference)).not.toContain(content.text);
	});

	it("belongs to the session that produced it, and to no other", () => {
		const reference = ArtifactReference.fromContent(ID, SESSION, content);

		expect(reference.belongsTo(SESSION)).toBe(true);
		expect(reference.belongsTo(SessionId.from("s-2"))).toBe(false);
	});

	it("recognizes the content it was built from", () => {
		expect(
			ArtifactReference.fromContent(ID, SESSION, content).matches(ArtifactContent.fromText("a very long report")),
		).toBe(true);
	});

	it("says its shape is explorable without naming which tools understand it, since an agent's catalog is its own", () => {
		const reference = ArtifactReference.fromContent(ID, SESSION, content);

		expect(reference.toString(OffloadDecision.EXPLORABLE)).toContain(
			"its shape is one the artifact exploration tools understand",
		);
		expect(reference.toString(OffloadDecision.OPAQUE)).not.toContain(
			"its shape is one the artifact exploration tools understand",
		);
		expect(reference.toString(OffloadDecision.OPAQUE)).toContain("read_artifact");
	});

	it("refuses content that is not what it fingerprinted", () => {
		expect(
			ArtifactReference.fromContent(ID, SESSION, content).matches(ArtifactContent.fromText("a tampered report")),
		).toBe(false);
	});

	it("reads as a placeholder the model can act on", () => {
		expect(ArtifactReference.fromContent(ID, SESSION, content).toString()).toBe(
			"[artifact a-1, text/markdown, 18 characters, read with read_artifact(artifactId, offset, limit)]",
		);
	});

	it("shows the name in the placeholder, so three files read as three files", () => {
		const named = ArtifactContent.fromText("a,b", "text/csv", ArtifactName.fromText("sales.csv"));

		expect(ArtifactReference.fromContent(ID, SESSION, named).toString(OffloadDecision.EXPLORABLE)).toContain(
			'[artifact a-1 "sales.csv", text/csv, 3 characters',
		);
	});

	it("says bytes are not readable by a tool, and offers none", () => {
		const image = ArtifactContent.fromBytes(new Uint8Array([1, 2, 3]), "image/png");
		const reference = ArtifactReference.fromContent(ID, SESSION, image);

		expect(reference.isText).toBe(false);
		expect(reference.bytes).toBe(3);
		expect(reference.toString(OffloadDecision.EXPLORABLE)).toBe(
			"[artifact a-1, image/png, 3 bytes, not readable by a tool]",
		);
	});

	it("comes back from storage with the fingerprint it was stored with", () => {
		const restored = ArtifactReference.restore({
			id: ID,
			sessionId: SESSION,
			digest: content.digest(),
			mediaType: "text/markdown",
			characters: 18,
		});

		expect(restored.matches(content)).toBe(true);
		expect(restored.isText).toBe(true);
		expect(restored.bytes).toBe(18);
	});
});
