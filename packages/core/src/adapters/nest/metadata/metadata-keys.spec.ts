import { describe, expect, it } from "vitest";
import {
	AGENT_METADATA,
	DELEGATES_TO_METADATA,
	INLINE_SKILLS_METADATA,
	INLINE_TOOLS_METADATA,
	SKILL_METADATA,
	TOOL_METADATA,
	TRANSFERS_TO_METADATA,
} from "./metadata-keys";

describe("metadata keys", () => {
	it("are all distinct, so one decorator never overwrites another", () => {
		const keys = [
			AGENT_METADATA,
			TOOL_METADATA,
			SKILL_METADATA,
			INLINE_TOOLS_METADATA,
			INLINE_SKILLS_METADATA,
			TRANSFERS_TO_METADATA,
			DELEGATES_TO_METADATA,
		];

		expect(new Set(keys).size).toBe(keys.length);
	});

	it("are registered symbols, so two copies of the package still agree", () => {
		expect(AGENT_METADATA).toBe(Symbol.for("adk:agent"));
	});
});
