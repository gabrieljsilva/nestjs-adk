import { describe, expect, it } from "vitest";
import { AdkError } from "../../../common/errors/adk.error";
import { AmbiguousAgentPromptError } from "./ambiguous-agent-prompt.error";

describe("AmbiguousAgentPromptError", () => {
	it("carries a stable code and the taxonomy's base", () => {
		const error = new AmbiguousAgentPromptError("SupportAgent");

		expect(error).toBeInstanceOf(AdkError);
		expect(error.code).toBe("AMBIGUOUS_AGENT_PROMPT");
		expect(error.name).toBe("AmbiguousAgentPromptError");
	});

	/** The provider is what a developer opens, so the message has to name it. */
	it("names the provider and says which declaration to keep", () => {
		const error = new AmbiguousAgentPromptError("SupportAgent");

		expect(error.providerName).toBe("SupportAgent");
		expect(error.message).toContain("SupportAgent");
		expect(error.message).toContain("prompt()");
	});
});
