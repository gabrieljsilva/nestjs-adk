import { describe, expect, it } from "vitest";
import { AdkError } from "../../../common/errors/adk.error";
import { ConflictingPromptOptionsError } from "./conflicting-prompt-options.error";

describe("ConflictingPromptOptionsError", () => {
	it("carries a stable code and the taxonomy's base", () => {
		const error = new ConflictingPromptOptionsError();

		expect(error).toBeInstanceOf(AdkError);
		expect(error.code).toBe("CONFLICTING_PROMPT_OPTIONS");
		expect(error.name).toBe("ConflictingPromptOptionsError");
	});

	it("names both options, since which one to drop is the whole question", () => {
		const error = new ConflictingPromptOptionsError();

		expect(error.message).toContain("promptSource");
		expect(error.message).toContain("prompts.dir");
	});
});
