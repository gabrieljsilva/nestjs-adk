import { describe, expect, it } from "vitest";
import { ArtifactId } from "../../../common/identity/artifact-id.value-object";
import { MediaPart } from "../messages/media-part.value-object";
import { AttachmentProjection } from "./attachment-projection.value-object";
import { AttachmentReference } from "./attachment-reference.value-object";

const PIXEL = "iVBORw0KGgo=";

describe("AttachmentProjection", () => {
	it("carries the media the model will see", () => {
		const part = MediaPart.image("image/png", PIXEL);
		const projection = AttachmentProjection.media(part);

		expect(projection.isMedia).toBe(true);
		expect(projection.isNote).toBe(false);
		expect(projection.part).toBe(part);
	});

	it("carries the line that stands in for the media", () => {
		const projection = AttachmentProjection.note("[attachment image/png: not this turn]");

		expect(projection.isNote).toBe(true);
		expect(projection.isMedia).toBe(false);
		expect(projection.text).toBe("[attachment image/png: not this turn]");
	});

	it("carries nothing at all, which is the honest shape of leaving the context", () => {
		const projection = AttachmentProjection.omit();

		expect(projection.isMedia).toBe(false);
		expect(projection.isNote).toBe(false);
		expect(projection.part).toBeUndefined();
		expect(projection.text).toBeUndefined();
	});

	it("writes a note in the one vocabulary every stand-in uses", () => {
		const reference = AttachmentReference.external("file-7", "image/png");

		expect(AttachmentProjection.noteFor(reference, "no longer available").text).toBe(
			"[attachment image/png: no longer available]",
		);
	});

	it("writes the note without a type when the reference carries none", () => {
		const reference = AttachmentReference.artifact(ArtifactId.from("a-1"));

		expect(AttachmentProjection.noteFor(reference, "could not be resolved").text).toBe(
			"[attachment: could not be resolved]",
		);
	});
});
