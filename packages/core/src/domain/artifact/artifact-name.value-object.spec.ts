import { describe, expect, it } from "vitest";
import { ArtifactName } from "./artifact-name.value-object";
import { InvalidArtifactNameError } from "./errors/invalid-artifact-name.error";

describe("ArtifactName", () => {
	it("keeps an ordinary file name, trimmed", () => {
		expect(ArtifactName.fromText("  sales-2024.csv ").value).toBe("sales-2024.csv");
	});

	it("accepts a name with spaces, dots and non ASCII letters", () => {
		expect(ArtifactName.fromText("relatório final (v2).md").value).toBe("relatório final (v2).md");
	});

	it("refuses an empty name", () => {
		expect(() => ArtifactName.fromText("   ")).toThrow(InvalidArtifactNameError);
	});

	it("refuses a name longer than the ceiling, because the placeholder line has a budget", () => {
		expect(() => ArtifactName.fromText("x".repeat(ArtifactName.MAX_LENGTH + 1))).toThrow(InvalidArtifactNameError);
		expect(ArtifactName.fromText("x".repeat(ArtifactName.MAX_LENGTH)).value).toHaveLength(ArtifactName.MAX_LENGTH);
	});

	it("refuses a line break, which would end the placeholder early", () => {
		expect(() => ArtifactName.fromText("a\nb.txt")).toThrow(InvalidArtifactNameError);
	});

	it("refuses square brackets, which would forge a placeholder", () => {
		expect(() => ArtifactName.fromText("x.txt] [artifact a-9")).toThrow(InvalidArtifactNameError);
	});

	it("refuses a control character", () => {
		expect(() => ArtifactName.fromText("ab")).toThrow(InvalidArtifactNameError);
	});

	it("compares by value", () => {
		expect(ArtifactName.fromText("a.md").equals(ArtifactName.fromText("a.md"))).toBe(true);
		expect(ArtifactName.fromText("a.md").equals(ArtifactName.fromText("b.md"))).toBe(false);
	});
});
