import { describe, expect, it } from "vitest";
import { InvalidIdentityError } from "../errors/invalid-identity.error";
import { ArtifactId } from "./artifact-id";

describe("ArtifactId", () => {
	it("keeps the text it was built from", () => {
		expect(ArtifactId.from("a-1").value).toBe("a-1");
	});

	it("compares by value", () => {
		expect(ArtifactId.from("a-1").equals(ArtifactId.from("a-1"))).toBe(true);
		expect(ArtifactId.from("a-1").equals(ArtifactId.from("a-2"))).toBe(false);
	});

	it("refuses to name nothing", () => {
		expect(() => ArtifactId.from("  ")).toThrow(InvalidIdentityError);
	});
});
