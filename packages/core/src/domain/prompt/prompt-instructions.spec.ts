import { describe, expect, it } from "vitest";
import { PromptInstructions } from "./prompt-instructions";

describe("PromptInstructions", () => {
	it("trims the text it was given", () => {
		expect(PromptInstructions.from("  be helpful  ").text).toBe("be helpful");
	});

	it("reports an empty prompt instead of substituting a default", () => {
		expect(PromptInstructions.from("   ").isEmpty).toBe(true);
	});

	it("joins two prompts with a blank line between them", () => {
		const joined = PromptInstructions.from("runtime").concat(PromptInstructions.from("agent"));

		expect(joined.text).toBe("runtime\n\nagent");
	});

	it("skips an empty side when joining", () => {
		expect(PromptInstructions.from("").concat(PromptInstructions.from("agent")).text).toBe("agent");
		expect(PromptInstructions.from("runtime").concat(PromptInstructions.from("")).text).toBe("runtime");
	});

	it("prints its text", () => {
		expect(String(PromptInstructions.from("be helpful"))).toBe("be helpful");
	});
});
