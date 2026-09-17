import { describe, expect, it } from "vitest";
import { ArtifactId } from "../../../common/identity/artifact-id";
import { AttachmentReference } from "./attachment-reference";

describe("AttachmentReference", () => {
	it("names an artifact by id, and nothing else", () => {
		const reference = AttachmentReference.artifact(ArtifactId.from("a-1"));

		expect(reference.artifactId?.value).toBe("a-1");
		expect(reference.isLink).toBe(false);
		expect(reference.url).toBeUndefined();
	});

	it("names a link by address, and keeps the type nothing else knows", () => {
		const reference = AttachmentReference.link("https://cdn.example/x.png", "image/png");

		expect(reference.isLink).toBe(true);
		expect(reference.url).toBe("https://cdn.example/x.png");
		expect(reference.mediaType).toBe("image/png");
		expect(reference.artifactId).toBeUndefined();
	});

	it("names an external file by the application's own id, holding no bytes and no address", () => {
		const reference = AttachmentReference.external("file-7", "image/png");

		expect(reference.isExternal).toBe(true);
		expect(reference.externalId).toBe("file-7");
		expect(reference.mediaType).toBe("image/png");
		expect(reference.artifactId).toBeUndefined();
		expect(reference.url).toBeUndefined();
		expect(reference.isLink).toBe(false);
	});

	it("is external only when it carries an external id", () => {
		expect(AttachmentReference.artifact(ArtifactId.from("a-1")).isExternal).toBe(false);
		expect(AttachmentReference.link("https://cdn.example/x.png", "image/png").isExternal).toBe(false);
	});
});
