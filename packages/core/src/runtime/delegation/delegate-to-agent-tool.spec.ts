import { describe, expect, it } from "vitest";
import { AgentDelegationPolicy } from "../../domain/agent/agent-delegation-policy";
import { AgentName } from "../../domain/agent/agent-name";
import { DelegateToAgentTool } from "./delegate-to-agent-tool";

const RESEARCHER = AgentName.from("researcher");
const TRANSLATOR = AgentName.from("translator");

function toolFor(...targets: readonly AgentName[]) {
	return DelegateToAgentTool.forPolicy(AgentDelegationPolicy.to(targets));
}

describe("DelegateToAgentTool", () => {
	it("offers exactly the declared targets to the model", () => {
		const declaration = toolFor(RESEARCHER, TRANSLATOR).schema.declaration();
		const properties = Reflect.get(Object(declaration), "properties");
		const agentName = Reflect.get(Object(properties), "agentName");

		expect(Reflect.get(Object(agentName), "enum")).toEqual(["researcher", "translator"]);
	});

	it("refuses a target the agent never declared", () => {
		const parsed = toolFor(RESEARCHER).schema.parse({ agentName: "legal", task: "read the contract" });

		expect(parsed.isValid).toBe(false);
		expect(parsed.reason).toContain("legal");
	});

	it("refuses a delegation with no task, because the child does not read this conversation", () => {
		expect(toolFor(RESEARCHER).schema.parse({ agentName: "researcher" }).isValid).toBe(false);
		expect(toolFor(RESEARCHER).schema.parse({ agentName: "researcher", task: "  " }).isValid).toBe(false);
	});

	it("accepts an agent and a task together", () => {
		const parsed = toolFor(RESEARCHER).schema.parse({ agentName: "researcher", task: "find the policy" });

		expect(parsed.isValid).toBe(true);
		expect(parsed.values).toEqual({ agentName: "researcher", task: "find the policy" });
	});

	it("is internal, so no approval policy stands between an agent and its own specialist", () => {
		expect(toolFor(RESEARCHER).internal).toBe(true);
	});

	it("reads the request back only from a call that was actually a delegation", () => {
		expect(DelegateToAgentTool.requestIn("delegate_to_agent", { agentName: "researcher", task: "go" })?.task).toBe("go");
		expect(DelegateToAgentTool.requestIn("lookup_order", { agentName: "researcher", task: "go" })).toBeUndefined();
		expect(DelegateToAgentTool.requestIn("delegate_to_agent", { agentName: "researcher" })).toBeUndefined();
	});

	it("never answers by itself, because a run is not something a handler can start", async () => {
		await expect(toolFor(RESEARCHER).handler.invoke({}, Object(undefined))).rejects.toThrow(/runtime/);
	});
});
