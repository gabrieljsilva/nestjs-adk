import { describe, expect, it } from "vitest";
import { EmptyModelResponseError } from "./empty-model-response.error";

describe("EmptyModelResponseError", () => {
	it("names the model and the agent, since a silent turn says nothing on its own", () => {
		const error = new EmptyModelResponseError("support", "google/gemini-flash");

		expect(error.code).toBe("EMPTY_MODEL_RESPONSE");
		expect(error.message).toContain("support");
		expect(error.message).toContain("google/gemini-flash");
	});
});
