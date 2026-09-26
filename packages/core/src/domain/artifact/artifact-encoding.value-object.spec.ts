import { describe, expect, it } from "vitest";
import { ArtifactEncoding } from "./artifact-encoding.value-object";

describe("ArtifactEncoding", () => {
	it("comes back from the name a store wrote", () => {
		expect(ArtifactEncoding.fromName("utf-8")).toBe(ArtifactEncoding.TEXT);
		expect(ArtifactEncoding.fromName("base64")).toBe(ArtifactEncoding.BASE64);
	});

	it("answers nothing for a name it never wrote", () => {
		expect(ArtifactEncoding.fromName("latin1")).toBeUndefined();
	});

	it("knows which one is text", () => {
		expect(ArtifactEncoding.TEXT.isText).toBe(true);
		expect(ArtifactEncoding.BASE64.isText).toBe(false);
	});
});
