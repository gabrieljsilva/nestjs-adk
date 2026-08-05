import { describe, expect, it } from "vitest";
import { RunLimits } from "../session/run-limits";
import { AgentExecutionPolicies } from "./agent-execution-policies";
import { AgentName } from "./agent-name";
import { AgentTransferPolicy } from "./agent-transfer-policy";
import { SequentialFailoverPolicy } from "./sequential-failover-policy";

describe("AgentExecutionPolicies", () => {
	it("means the safe thing when the agent declared nothing", () => {
		const policies = AgentExecutionPolicies.none();

		expect(policies.failover).toBeUndefined();
		expect(policies.compaction).toBeUndefined();
		expect(policies.limits).toBeUndefined();
		expect(policies.transfer.isEmpty).toBe(true);
	});

	it("carries what it was given", () => {
		const failover = new SequentialFailoverPolicy([]);
		const limits = RunLimits.of(3);

		const policies = AgentExecutionPolicies.of(failover, undefined, limits);

		expect(policies.failover).toBe(failover);
		expect(policies.limits).toBe(limits);
	});

	it("replaces only the transfer edges when asked to", () => {
		const limits = RunLimits.of(3);
		const policies = AgentExecutionPolicies.of(undefined, undefined, limits);

		const withTransfer = policies.withTransfer(AgentTransferPolicy.to([AgentName.from("billing")]));

		expect(withTransfer.limits).toBe(limits);
		expect(withTransfer.transfer.names).toEqual(["billing"]);
		expect(policies.transfer.isEmpty).toBe(true);
	});
});
