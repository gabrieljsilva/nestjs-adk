import { describe, expect, it } from "vitest";
import { AgentName } from "./agent-name";
import { AgentTransferPolicy } from "./agent-transfer-policy";

const BILLING = AgentName.from("billing");
const ESCALATION = AgentName.from("escalation");
const LEGAL = AgentName.from("legal");

describe("AgentTransferPolicy", () => {
	it("declares nobody by default", () => {
		const policy = AgentTransferPolicy.none();

		expect(policy.isEmpty).toBe(true);
		expect(policy.allows(BILLING)).toBe(false);
		expect(policy.describe()).toBe("none");
	});

	it("allows exactly what it was given", () => {
		const policy = AgentTransferPolicy.to([BILLING, ESCALATION]);

		expect(policy.allows(BILLING)).toBe(true);
		expect(policy.allows(ESCALATION)).toBe(true);
		expect(policy.allows(LEGAL)).toBe(false);
	});

	it("compares by the normalized name, so a target is one agent however it was written", () => {
		const policy = AgentTransferPolicy.to([AgentName.from("Billing Agent")]);

		expect(policy.allows(AgentName.from("billing-agent"))).toBe(true);
	});

	it("names the targets for whoever has to show them to a model", () => {
		const policy = AgentTransferPolicy.to([BILLING, ESCALATION]);

		expect(policy.names).toEqual(["billing", "escalation"]);
		expect(policy.describe()).toBe("billing, escalation");
	});

	it("keeps its own copy of the list it was handed", () => {
		const targets = [BILLING];
		const policy = AgentTransferPolicy.to(targets);
		targets.push(LEGAL);

		expect(policy.allows(LEGAL)).toBe(false);
	});

	it("has no edge back to whoever transferred here", () => {
		const support = AgentTransferPolicy.to([BILLING]);
		const billing = AgentTransferPolicy.none();

		expect(support.allows(BILLING)).toBe(true);
		expect(billing.allows(AgentName.from("support"))).toBe(false);
	});
});
