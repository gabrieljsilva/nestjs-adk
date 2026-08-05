import { describe, expect, it } from "vitest";
import { AgentRunId } from "../../common/identity/agent-run-id";
import { SessionId } from "../../common/identity/session-id";
import { ToolCallId } from "../../common/identity/tool-call-id";
import { AgentName } from "../../domain/agent/agent-name";
import { AgentTransferPolicy } from "../../domain/agent/agent-transfer-policy";
import { ToolContext } from "../../domain/tool/tool-context";
import { TransferToAgentTool } from "./transfer-to-agent-tool";

const BILLING = AgentName.from("billing");
const ESCALATION = AgentName.from("escalation");

function toolFor(...targets: readonly AgentName[]) {
	return TransferToAgentTool.forPolicy(AgentTransferPolicy.to(targets));
}

function contextOf(): ToolContext {
	return new ToolContext(
		SessionId.from("s-1"),
		AgentRunId.from("r-1"),
		AgentName.from("support"),
		ToolCallId.from("c-1"),
	);
}

describe("TransferToAgentTool", () => {
	it("offers exactly the declared targets to the model", () => {
		const declaration = toolFor(BILLING, ESCALATION).schema.declaration();
		const properties = Reflect.get(Object(declaration), "properties");
		const agentName = Reflect.get(Object(properties), "agentName");

		expect(Reflect.get(Object(agentName), "enum")).toEqual(["billing", "escalation"]);
	});

	it("names the available agents in its description, because that is what the model reads", () => {
		expect(toolFor(BILLING).description).toContain("billing");
	});

	it("refuses a target the agent never declared before any handler runs", () => {
		const parsed = toolFor(BILLING).schema.parse({ agentName: "legal" });

		expect(parsed.isValid).toBe(false);
		expect(parsed.reason).toContain("legal");
	});

	it("refuses arguments without a name at all", () => {
		expect(toolFor(BILLING).schema.parse({}).isValid).toBe(false);
	});

	it("is internal, so no approval policy stands between an agent and the agent it declared", () => {
		expect(toolFor(BILLING).internal).toBe(true);
	});

	it("confirms the handover to the model and does nothing else", async () => {
		const answer = await toolFor(BILLING).handler.invoke({ agentName: "billing" }, contextOf());

		expect(answer).toEqual({ transferredTo: "billing" });
	});

	it("reads the target back only from a call that was actually a transfer", () => {
		expect(TransferToAgentTool.targetOf("transfer_to_agent", { agentName: "billing" })).toBe("billing");
		expect(TransferToAgentTool.targetOf("lookup_order", { agentName: "billing" })).toBeUndefined();
		expect(TransferToAgentTool.targetOf("transfer_to_agent", {})).toBeUndefined();
	});
});
