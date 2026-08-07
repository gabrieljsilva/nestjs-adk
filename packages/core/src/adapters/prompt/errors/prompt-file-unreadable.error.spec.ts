import { describe, expect, it } from "vitest";
import { AdkError } from "../../../common/errors/adk.error";
import { PromptFileUnreadableError } from "./prompt-file-unreadable.error";

describe("PromptFileUnreadableError", () => {
	it("carries a stable code and the taxonomy's base", () => {
		const error = new PromptFileUnreadableError("/app/prompts/support.md", new Error("EACCES"));

		expect(error).toBeInstanceOf(AdkError);
		expect(error.code).toBe("PROMPT_FILE_UNREADABLE");
		expect(error.name).toBe("PromptFileUnreadableError");
	});

	/** The provider error is the only thing that says why, so it is never dropped. */
	it("names the path and keeps what the filesystem said as the cause", () => {
		const cause = new Error("EACCES: permission denied");

		const error = new PromptFileUnreadableError("/app/prompts/support.md", cause);

		expect(error.message).toBe("Cannot read the prompt file at /app/prompts/support.md.");
		expect(error.path).toBe("/app/prompts/support.md");
		expect(error.cause).toBe(cause);
	});
});
