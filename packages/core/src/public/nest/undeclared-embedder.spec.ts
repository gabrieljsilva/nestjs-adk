import { describe, expect, it } from "vitest";
import { Embedder } from "../../contracts/embedder";
import { EmbedderNotDeclaredError } from "./errors/embedder-not-declared.error";
import { UndeclaredEmbedder } from "./undeclared-embedder";

describe("UndeclaredEmbedder", () => {
	it("is an embedder, so injecting one always resolves", () => {
		expect(new UndeclaredEmbedder()).toBeInstanceOf(Embedder);
	});

	it("fails only when somebody embeds, naming the option to declare", async () => {
		const embedder = new UndeclaredEmbedder();

		await expect(embedder.embed()).rejects.toBeInstanceOf(EmbedderNotDeclaredError);
		await expect(embedder.embed()).rejects.toThrow(/embedder/);
	});
});
