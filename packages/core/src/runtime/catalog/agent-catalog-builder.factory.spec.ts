import { describe, expect, it } from "vitest";
import { AgentDefinition } from "../../domain/agent/agent-definition.value-object";
import { AgentDelegationPolicy } from "../../domain/agent/agent-delegation.policy";
import { AgentDescription } from "../../domain/agent/agent-description.value-object";
import { AgentExecutionPolicies } from "../../domain/agent/agent-execution-policies.value-object";
import { AgentName } from "../../domain/agent/agent-name.value-object";
import { AgentTransferPolicy } from "../../domain/agent/agent-transfer.policy";
import { DeclaredAgent } from "../../domain/agent/declared-agent.value-object";
import { SkillDefinition } from "../../domain/skill/skill-definition.value-object";
import { ToolEffect } from "../../domain/tool/approval/tool-effect.value-object";
import { ParsedArguments } from "../../domain/tool/invocation/parsed-arguments.value-object";
import { ToolHandler } from "../../domain/tool/invocation/tool-handler.contract";
import { ToolDefinition } from "../../domain/tool/tool-definition.value-object";
import { ToolSchema } from "../../domain/tool/tool-schema.contract";
import { ScriptedModel } from "../../support/run/scripted-model.fixture";
import { ReadArtifactTool } from "../artifact/read-artifact.tool";
import { EditArtifactTool } from "../artifact/tools/edit-artifact.tool";
import { ListArtifactsTool } from "../artifact/tools/list-artifacts.tool";
import { OutlineArtifactTool } from "../artifact/tools/outline-artifact.tool";
import { QueryArtifactTool } from "../artifact/tools/query-artifact.tool";
import { SearchArtifactTool } from "../artifact/tools/search-artifact.tool";
import { SliceArtifactTool } from "../artifact/tools/slice-artifact.tool";
import { DelegateToAgentTool } from "../delegation/delegate-to-agent.tool";
import { ActivateSkillTool } from "../skill/activate-skill.tool";
import { TransferToAgentTool } from "../transfer/transfer-to-agent.tool";
import { AgentCatalogBuilder } from "./agent-catalog-builder.factory";
import { DuplicateAgentNameError } from "./errors/duplicate-agent-name.error";
import { DuplicateRuntimeToolNameError } from "./errors/duplicate-runtime-tool-name.error";

class AnySchema extends ToolSchema {
	public declaration(): unknown {
		return { type: "object" };
	}

	public parse(): ParsedArguments {
		return ParsedArguments.valid({});
	}
}

class SilentHandler extends ToolHandler {
	public async invoke(): Promise<unknown> {
		return {};
	}
}

function ownTool(name: string): ToolDefinition {
	return new ToolDefinition(name, "does something", new AnySchema(), ToolEffect.READ, new SilentHandler());
}

function agent(name: string, tools: readonly ToolDefinition[] = [], provider = "SupportAgent"): DeclaredAgent {
	const definition = new AgentDefinition({
		name: AgentName.from(name),
		description: AgentDescription.from(`${name} agent`, name),
		model: new ScriptedModel("primary"),
		tools: tools,
	});
	return new DeclaredAgent(definition, provider);
}

function raisedBy(attempt: () => unknown): unknown {
	try {
		attempt();
	} catch (error) {
		return error;
	}
	return undefined;
}

const OPT_IN = [
	ListArtifactsTool,
	OutlineArtifactTool,
	SearchArtifactTool,
	QueryArtifactTool,
	SliceArtifactTool,
	EditArtifactTool,
];

const APPENDED_BY_THE_RUN_SCOPE = [ActivateSkillTool, TransferToAgentTool, DelegateToAgentTool];

/**
 * The builder is the one door both entry points walk through: `AdkModule` reaches it with what
 * the Nest scanner discovered, `createAdkRuntime` with definitions built by hand. That is why the
 * collision with a runtime tool name is refused here and not in the scanner or in the run scope:
 * a static mistake fails at boot, once, naming the provider that made it.
 */
describe("AgentCatalogBuilder", () => {
	it("refuses an agent that declares a tool of its own named read_artifact, which every agent with tools is given", () => {
		const builder = new AgentCatalogBuilder();

		expect(() => builder.add(agent("support", [ownTool(ReadArtifactTool.NAME)]))).toThrow(DuplicateRuntimeToolNameError);
	});

	for (const tool of OPT_IN) {
		it(`refuses an agent that declares a tool of its own named ${tool.NAME}, because the runtime binds its own last and the declared one would vanish`, () => {
			const builder = new AgentCatalogBuilder();

			expect(() => builder.add(agent("support", [ownTool(tool.NAME)]))).toThrow(DuplicateRuntimeToolNameError);
		});
	}

	for (const tool of APPENDED_BY_THE_RUN_SCOPE) {
		it(`refuses an agent that declares a tool of its own named ${tool.NAME}, which the run scope appends after the agent's own tools and which would therefore win`, () => {
			const builder = new AgentCatalogBuilder();

			expect(() => builder.add(agent("support", [ownTool(tool.NAME)]))).toThrow(DuplicateRuntimeToolNameError);
		});

		it(`refuses ${tool.NAME} on an agent with no skills, no transfer edges and no delegation edges, which never receives that tool: a name reserved only when the edge exists is a boot that breaks the day somebody adds the edge, for a reason nowhere near the edit`, () => {
			const bare = agent("support", [ownTool(tool.NAME)]);

			expect(bare.definition.skills).toEqual([]);
			expect(bare.definition.transfersToAnyone).toBe(false);
			expect(bare.definition.delegatesToAnyone).toBe(false);
			expect(() => new AgentCatalogBuilder().add(bare)).toThrow(DuplicateRuntimeToolNameError);
		});
	}

	it("accepts an agent that has a skill, a transfer edge and a delegation edge and declared none of those three names, because the reservation refuses a collision and not a capability", () => {
		const connected = new DeclaredAgent(
			new AgentDefinition({
				name: AgentName.from("concierge"),
				description: AgentDescription.from("concierge agent", "concierge"),
				model: new ScriptedModel("primary"),
				tools: [ownTool("lookup_order")],
				skills: [SkillDefinition.onDemand("legal", "The terms", "the long terms")],
				policies: AgentExecutionPolicies.none()
					.withTransfer(AgentTransferPolicy.to([AgentName.from("billing")]))
					.withDelegation(AgentDelegationPolicy.to([AgentName.from("research")])),
			}),
			"ConciergeAgent",
		);

		const catalog = new AgentCatalogBuilder()
			.add(connected)
			.add(agent("billing", [], "BillingAgent"))
			.add(agent("research", [], "ResearchAgent"))
			.build();

		expect(catalog.names).toEqual(["concierge", "billing", "research"]);
	});

	it("accepts an agent that asked for a runtime tool, because a request and the tool it stands for share a name on purpose", () => {
		const builder = new AgentCatalogBuilder();

		const catalog = builder.add(agent("support", [ListArtifactsTool.request()])).build();

		expect(catalog.names).toEqual(["support"]);
	});

	it("accepts an agent that asked for every runtime tool at once, so asking for the group is never mistaken for a collision", () => {
		const asked = OPT_IN.map((tool) => tool.request());

		const catalog = new AgentCatalogBuilder().add(agent("support", asked)).build();

		expect(catalog.names).toEqual(["support"]);
	});

	it("refuses an agent that asked for a runtime tool and also declared a tool of its own under that name", () => {
		const declared = [ListArtifactsTool.request(), ownTool(ListArtifactsTool.NAME)];

		expect(() => new AgentCatalogBuilder().add(agent("support", declared))).toThrow(DuplicateRuntimeToolNameError);
	});

	it("refuses the same collision when the agent's own tool comes first, because order decides nothing about a name", () => {
		const declared = [ownTool(ListArtifactsTool.NAME), ListArtifactsTool.request()];

		expect(() => new AgentCatalogBuilder().add(agent("support", declared))).toThrow(DuplicateRuntimeToolNameError);
	});

	it("leaves an agent whose tools collide with nothing exactly as it was declared", () => {
		const lookup = ownTool("lookup_order");

		const catalog = new AgentCatalogBuilder().add(agent("support", [lookup])).build();

		expect(catalog.findOrFail(AgentName.from("support")).tools).toEqual([lookup]);
	});

	it("names the tool, the agent and the provider that declared it, under a code a handler can branch on", () => {
		const raised = raisedBy(() =>
			new AgentCatalogBuilder().add(agent("support", [ownTool(SearchArtifactTool.NAME)], "SupportAgent")),
		);

		expect(raised).toBeInstanceOf(DuplicateRuntimeToolNameError);
		const error = raised as DuplicateRuntimeToolNameError;
		expect(error.code).toBe("CATALOG_DUPLICATE_RUNTIME_TOOL_NAME");
		expect([error.toolName, error.agentName, error.providerName]).toEqual(["search_artifact", "support", "SupportAgent"]);
		expect(error.message).toContain("rename yours");
	});

	it("still refuses two agents declared under one name, which is the other clash this builder owns", () => {
		const builder = new AgentCatalogBuilder().add(agent("support", [], "FirstAgent"));

		expect(() => builder.add(agent("support", [], "SecondAgent"))).toThrow(DuplicateAgentNameError);
	});
});
