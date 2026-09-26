import { describe, expect, it } from "vitest";
import { DuplicateRuntimeToolNameError } from "./duplicate-runtime-tool-name.error";

describe("DuplicateRuntimeToolNameError", () => {
	it("carries a code a handler can branch on without reading the message", () => {
		const error = new DuplicateRuntimeToolNameError("read_artifact", "support", "SupportAgent");

		expect(error.code).toBe("CATALOG_DUPLICATE_RUNTIME_TOOL_NAME");
	});

	it("names the tool, the agent and the provider, because that is what the developer has to go and open", () => {
		const error = new DuplicateRuntimeToolNameError("read_artifact", "support", "SupportAgent");

		expect(error.message).toContain("read_artifact");
		expect(error.message).toContain("support");
		expect(error.message).toContain("SupportAgent");
	});

	it("says what to do about it, since the runtime cannot give up a name it binds on every run", () => {
		const error = new DuplicateRuntimeToolNameError("edit_artifact", "editor", "EditorAgent");

		expect(error.message).toContain("rename yours");
	});

	it("keeps the three facts readable, so a boot report can group by the provider that caused it", () => {
		const error = new DuplicateRuntimeToolNameError("edit_artifact", "editor", "EditorAgent");

		expect([error.toolName, error.agentName, error.providerName]).toEqual(["edit_artifact", "editor", "EditorAgent"]);
	});
});
