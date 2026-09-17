import { describe, expect, it } from "vitest";
import { AdkError } from "../../../common/errors/adk.error";
import { ArtifactNotExplorableError } from "./artifact-not-explorable.error";

describe("ArtifactNotExplorableError", () => {
	it("says what the artifact is, what was needed, and what to call instead", () => {
		const error = new ArtifactNotExplorableError("a-1", "text/plain", "JSON");

		expect(error.message).toContain("a-1");
		expect(error.message).toContain("text/plain");
		expect(error.message).toContain("JSON");
		expect(error.message).toContain("read_artifact");
	});

	it("carries a stable code an application can branch on", () => {
		expect(new ArtifactNotExplorableError("a-1", "image/png", "JSON").code).toBe("ARTIFACT_NOT_EXPLORABLE");
		expect(new ArtifactNotExplorableError("a-1", "image/png", "JSON")).toBeInstanceOf(AdkError);
	});
});
