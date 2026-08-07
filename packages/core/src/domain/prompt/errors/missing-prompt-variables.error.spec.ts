import { describe, expect, it } from "vitest";
import { AdkError } from "../../../common/errors/adk.error";
import { MissingPromptVariablesError } from "./missing-prompt-variables.error";

describe("MissingPromptVariablesError", () => {
	it("carries a stable code and the taxonomy's base", () => {
		const error = new MissingPromptVariablesError(["name"]);

		expect(error).toBeInstanceOf(AdkError);
		expect(error.code).toBe("PROMPT_MISSING_VARIABLES");
		expect(error.name).toBe("MissingPromptVariablesError");
	});

	it("lists every missing variable in the message", () => {
		const error = new MissingPromptVariablesError(["name", "plan"]);

		expect(error.message).toBe("The prompt is missing required variables: name, plan.");
		expect(error.missing).toEqual(["name", "plan"]);
	});

	it("names the template when the prompt came from one", () => {
		const error = new MissingPromptVariablesError(["name"], "support.md");

		expect(error.message).toBe("Prompt support.md is missing required variables: name.");
		expect(error.template).toBe("support.md");
	});
});
