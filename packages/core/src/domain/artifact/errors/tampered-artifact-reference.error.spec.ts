import { describe, expect, it } from "vitest";
import { AdkError } from "../../../common/errors/adk.error";
import { TamperedArtifactReferenceError } from "./tampered-artifact-reference.error";

describe("TamperedArtifactReferenceError", () => {
	it("carries both fingerprints, because which one moved is the whole question", () => {
		const error = new TamperedArtifactReferenceError("a-1", "sha256:aaa", "sha256:bbb");

		expect(error).toBeInstanceOf(AdkError);
		expect(error.code).toBe("ARTIFACT_REFERENCE_TAMPERED");
		expect(error.message).toContain("sha256:aaa");
		expect(error.message).toContain("sha256:bbb");
	});
});
