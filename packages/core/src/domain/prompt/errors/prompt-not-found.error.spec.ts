import { describe, expect, it } from "vitest";
import { AdkError } from "../../../common/errors/adk.error";
import { PromptNotFoundError } from "./prompt-not-found.error";

describe("PromptNotFoundError", () => {
	it("carries a stable code and the taxonomy's base", () => {
		const error = new PromptNotFoundError("support.md", "/app/prompts/support.md");

		expect(error).toBeInstanceOf(AdkError);
		expect(error.code).toBe("PROMPT_NOT_FOUND");
		expect(error.name).toBe("PromptNotFoundError");
	});

	/** The name alone never explains an absence: where it resolved to is the answer. */
	it("says both what was asked for and where the source looked", () => {
		const error = new PromptNotFoundError("support.md", "/app/prompts/support.md");

		expect(error.message).toBe("No prompt named support.md. The source looked in /app/prompts/support.md.");
		expect(error.prompt).toBe("support.md");
		expect(error.location).toBe("/app/prompts/support.md");
	});
});
