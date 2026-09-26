import { describe, expect, it } from "vitest";
import { ArtifactContent } from "./artifact-content.value-object";
import { ArtifactEncoding } from "./artifact-encoding.value-object";
import { ArtifactName } from "./artifact-name.value-object";

const PNG_HEADER = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

describe("ArtifactContent", () => {
	it("keeps the text exactly as it was given", () => {
		expect(ArtifactContent.fromText("  spaced  ").text).toBe("  spaced  ");
	});

	it("defaults to plain text and normalizes the media type it was told", () => {
		expect(ArtifactContent.fromText("x").mediaType).toBe("text/plain");
		expect(ArtifactContent.fromText("x", " Application/JSON ").mediaType).toBe("application/json");
	});

	it("measures text in characters, which is what a context budget counts", () => {
		expect(ArtifactContent.fromText("hello").characters).toBe(5);
		expect(ArtifactContent.fromText("hello").bytes).toBe(5);
		expect(ArtifactContent.fromText("héllo").bytes).toBe(6);
	});

	it("keeps bytes as base64 and knows they are not text", () => {
		const content = ArtifactContent.fromBytes(PNG_HEADER, "image/png");

		expect(content.isText).toBe(false);
		expect(content.encoding).toBe(ArtifactEncoding.BASE64);
		expect(content.text).toBe(Buffer.from(PNG_HEADER).toString("base64"));
		expect(content.base64).toBe(content.text);
		expect(content.bytes).toBe(PNG_HEADER.length);
		expect(content.characters).toBe(0);
	});

	it("takes bytes that already arrived as base64 without decoding them", () => {
		const content = ArtifactContent.fromBase64("iVBORw0KGgo=", "image/png");

		expect(content.isText).toBe(false);
		expect(content.text).toBe("iVBORw0KGgo=");
		expect(content.bytes).toBe(8);
	});

	it("defaults bytes to an octet stream rather than to text", () => {
		expect(ArtifactContent.fromBytes(PNG_HEADER).mediaType).toBe("application/octet-stream");
	});

	it("answers text as base64 when a wire needs it that way", () => {
		expect(ArtifactContent.fromText("hi").base64).toBe("aGk=");
	});

	it("carries the name it was given, which the placeholder shows", () => {
		const content = ArtifactContent.fromText("a,b\n1,2", "text/csv", ArtifactName.fromText("sales.csv"));

		expect(content.name?.value).toBe("sales.csv");
		expect(ArtifactContent.fromText("x").name).toBeUndefined();
	});

	it("comes back from a store exactly as it was written", () => {
		const restored = ArtifactContent.restore("aGk=", "image/png", ArtifactEncoding.BASE64, ArtifactName.fromText("p"));

		expect(restored.isText).toBe(false);
		expect(restored.text).toBe("aGk=");
		expect(restored.name?.value).toBe("p");
	});

	it("digests the exact content, so the same text always fingerprints the same way", () => {
		expect(ArtifactContent.fromText("hello").digest().equals(ArtifactContent.fromText("hello").digest())).toBe(true);
	});

	it("digests a single changed character differently", () => {
		expect(ArtifactContent.fromText("hello").digest().equals(ArtifactContent.fromText("hellO").digest())).toBe(false);
	});

	it("names the algorithm that produced the fingerprint", () => {
		expect(ArtifactContent.fromText("hello").digest().algorithm).toBe("sha256");
	});
});
