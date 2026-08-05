import { describe, expect, it } from "vitest";
import { AgentRunId } from "../../common/identity/agent-run-id";
import { SessionId } from "../../common/identity/session-id";
import { ToolCallId } from "../../common/identity/tool-call-id";
import { AgentName } from "../../domain/agent/agent-name";
import { SkillDefinition } from "../../domain/skill/skill-definition";
import { ToolContext } from "../../domain/tool/tool-context";
import { ToolEffect } from "../../domain/tool/tool-effect";
import { ActivateSkillTool } from "./activate-skill-tool";
import { SkillCatalog } from "./skill-catalog";

const catalog = SkillCatalog.of([
	SkillDefinition.always("refunds", "How refunds work", "refund policy"),
	SkillDefinition.onDemand("legal", "The full terms", "the very long terms"),
]);
const context = new ToolContext(
	SessionId.from("s-1"),
	AgentRunId.from("run-1"),
	AgentName.from("support"),
	ToolCallId.from("c-1"),
);

describe("ActivateSkillTool", () => {
	it("declares itself as a read, so no approval ever blocks knowing something", () => {
		expect(ActivateSkillTool.forCatalog(catalog).effect).toBe(ToolEffect.READ);
		expect(ActivateSkillTool.forCatalog(catalog).name).toBe("activate_skill");
	});

	it("offers only the skills that can be loaded", () => {
		const declaration = JSON.stringify(ActivateSkillTool.forCatalog(catalog).toDeclaration());

		expect(declaration).toContain("legal");
		expect(declaration).not.toContain("refund policy");
	});

	it("answers with the whole content of the skill", async () => {
		const tool = ActivateSkillTool.forCatalog(catalog);

		expect(await tool.handler.invoke({ skillName: "legal" }, context)).toBe("the very long terms");
	});

	it("refuses a name that is not a loadable skill", () => {
		const schema = ActivateSkillTool.forCatalog(catalog).schema;

		expect(schema.parse({ skillName: "refunds" }).isValid).toBe(false);
		expect(schema.parse({ skillName: "unknown" }).isValid).toBe(false);
		expect(schema.parse({}).isValid).toBe(false);
	});

	it("accepts a name it can load", () => {
		expect(ActivateSkillTool.forCatalog(catalog).schema.parse({ skillName: "legal" }).isValid).toBe(true);
	});
});
