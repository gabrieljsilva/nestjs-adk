import { describe, expect, it } from "vitest";
import { AdkError } from "../../../common/errors/adk.error";
import { ArtifactNotFoundError } from "./artifact-not-found.error";

describe("ArtifactNotFoundError", () => {
	it("names the artifact and the session that could not read it", () => {
		const error = new ArtifactNotFoundError("a-1", "s-2");

		expect(error).toBeInstanceOf(AdkError);
		expect(error.code).toBe("ARTIFACT_NOT_FOUND");
		expect(error.message).toContain("a-1");
		expect(error.message).toContain("s-2");
	});

	it("says nothing about whether the artifact exists elsewhere", () => {
		expect(new ArtifactNotFoundError("a-1", "s-2").message).not.toContain("owner");
	});
});
