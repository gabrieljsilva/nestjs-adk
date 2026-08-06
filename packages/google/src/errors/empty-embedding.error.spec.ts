import { AdkError } from "@nestjs-adk/core";
import { describe, expect, it } from "vitest";
import { EmptyEmbeddingError } from "./empty-embedding.error";

describe("EmptyEmbeddingError", () => {
	it("names the model that answered without a vector", () => {
		const error = new EmptyEmbeddingError("gemini-3.5-flash-lite");

		expect(error.model).toBe("gemini-3.5-flash-lite");
		expect(error.message).toContain("gemini-3.5-flash-lite");
	});

	it("is an AdkError with a code a caller can branch on", () => {
		const error = new EmptyEmbeddingError("gemini-embedding-2");

		expect(error).toBeInstanceOf(AdkError);
		expect(error.code).toBe("GEMINI_EMPTY_EMBEDDING");
	});
});
