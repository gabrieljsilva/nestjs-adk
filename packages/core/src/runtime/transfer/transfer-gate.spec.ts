import { describe, expect, it } from "vitest";
import { AgentDefinition } from "../../domain/agent/agent-definition";
import { AgentDescription } from "../../domain/agent/agent-description";
import { AgentExecutionPolicies } from "../../domain/agent/agent-execution-policies";
import { AgentName } from "../../domain/agent/agent-name";
import { AgentTransferPolicy } from "../../domain/agent/agent-transfer-policy";
import { DeclaredAgent } from "../../domain/agent/declared-agent";
import { TransferNotDeclaredError } from "../../domain/agent/errors/transfer-not-declared.error";
import type { LlmModel } from "../../domain/model/llm-model";
import { ScriptedModel } from "../../support/run/scripted-model.fixture";
import { AgentCatalog } from "../catalog/agent-catalog";
import { TransferGate } from "./transfer-gate";

const SUPPORT = AgentName.from("support");
const BILLING = AgentName.from("billing");
const LEGAL = AgentName.from("legal");

function agent(name: AgentName, transfer: AgentTransferPolicy = AgentTransferPolicy.none()): AgentDefinition {
	const model: LlmModel = new ScriptedModel("primary");
	return AgentDefinition.of(
		name,
		AgentDescription.from(`${name.value} agent`, name.value),
		model,
		undefined,
		AgentExecutionPolicies.of(undefined, undefined, undefined, transfer),
	);
}

function gateOver(...definitions: readonly AgentDefinition[]): TransferGate {
	return new TransferGate(AgentCatalog.of(definitions.map((definition) => new DeclaredAgent(definition, "Provider"))));
}

describe("TransferGate", () => {
	it("opens a handover the agent declared", () => {
		const support = agent(SUPPORT, AgentTransferPolicy.to([BILLING]));
		const gate = gateOver(support, agent(BILLING));

		expect(gate.open(support, BILLING).name.value).toBe("billing");
	});

	it("refuses a target the agent never named, listing what it did name", () => {
		const support = agent(SUPPORT, AgentTransferPolicy.to([BILLING]));
		const gate = gateOver(support, agent(BILLING), agent(LEGAL));

		expect(() => gate.open(support, LEGAL)).toThrow(TransferNotDeclaredError);
		expect(() => gate.open(support, LEGAL)).toThrow(/Declared: billing/);
	});

	it("refuses everything for an agent that declared no edge at all", () => {
		const support = agent(SUPPORT);
		const gate = gateOver(support, agent(BILLING));

		expect(gate.allowsFrom(support, BILLING)).toBe(false);
		expect(() => gate.open(support, BILLING)).toThrow(/Declared: none/);
	});
});
