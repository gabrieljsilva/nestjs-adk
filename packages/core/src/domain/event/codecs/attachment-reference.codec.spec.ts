import { describe, expect, it } from "vitest";
import { ArtifactId } from "../../../common/identity/artifact-id";
import { AttachmentReference } from "../../model/attachment-reference";
import { AttachmentReferenceCodec } from "./attachment-reference.codec";

const codec = new AttachmentReferenceCodec();

describe("AttachmentReferenceCodec", () => {
	it("writes a stored attachment as the id it was written under", () => {
		expect(codec.encode(AttachmentReference.artifact(ArtifactId.from("a-1")))).toEqual({ id: "a-1" });
	});

	it("writes a link as the address and the type nothing else knows", () => {
		const encoded = codec.encode(AttachmentReference.link("https://cdn.example/x.png", "image/png"));

		expect(encoded).toEqual({ url: "https://cdn.example/x.png", mediaType: "image/png" });
	});

	it("round trips both kinds", () => {
		const link = codec.decode(codec.encode(AttachmentReference.link("https://cdn.example/x.png", "image/png")));
		const stored = codec.decode(codec.encode(AttachmentReference.artifact(ArtifactId.from("a-1"))));

		expect(link?.url).toBe("https://cdn.example/x.png");
		expect(stored?.artifactId?.value).toBe("a-1");
	});

	it("reads the bare string the first version of the field wrote", () => {
		const decoded = codec.decode("a-1");

		expect(decoded?.artifactId?.value).toBe("a-1");
		expect(decoded?.isLink).toBe(false);
	});

	it("answers nothing for a value that names neither", () => {
		expect(codec.decode(7)).toBeUndefined();
		expect(codec.decode(null)).toBeUndefined();
		expect(codec.decode({})).toBeUndefined();
		expect(codec.decode({ url: "https://cdn.example/x.png" })).toBeUndefined();
	});
});
