import { describe, expect, it } from "vitest";
import { AdkError } from "../../../common/errors/adk.error";
import { InvalidArtifactNameError } from "./invalid-artifact-name.error";

describe("InvalidArtifactNameError", () => {
	it("names the offending value and the reason it was refused", () => {
		const error = new InvalidArtifactNameError("bad]name", "holds a square bracket");

		expect(error).toBeInstanceOf(AdkError);
		expect(error.code).toBe("INVALID_ARTIFACT_NAME");
		expect(error.message).toContain("bad]name");
		expect(error.message).toContain("square bracket");
	});
});
