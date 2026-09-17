import { describe, expect, it } from "vitest";
import { AgentTransferPolicy } from "../../../domain/agent/agent-transfer.policy";
import { WindowShareCompactionPolicy } from "../../../domain/context/window-share-compaction.policy";
import { RunLimits } from "../../../domain/session/run/run-limits.value-object";
import { ScriptedModel } from "../../../support/run/scripted-model.fixture";
import { InvalidAgentMetadataError } from "../errors/invalid-agent-metadata.error";
import { NestComponentDiscovery } from "./nest-component-discovery.service";

const MODEL = new ScriptedModel("primary");

describe("NestComponentDiscovery", () => {
	it("turns a validated payload into a definition", () => {
		const [declared] = new NestComponentDiscovery().discover([
			{ providerName: "SupportAgent", metadata: { name: "support", description: "Handles orders." }, model: MODEL },
		]);

		expect(declared?.definition.name.value).toBe("support");
		expect(declared?.providerName).toBe("SupportAgent");
	});

	/** The definition is the only place a run reads it from, so a policy that stops here never runs. */
	it("carries the compaction policy onto the definition", () => {
		const policy = new WindowShareCompactionPolicy({ maxShare: 0.9, targetShare: 0.7, keepRecentBlocks: 2 });

		const [declared] = new NestComponentDiscovery().discover([
			{ providerName: "SupportAgent", metadata: { name: "support", description: "d" }, model: MODEL, compaction: policy },
		]);

		expect(declared?.definition.compaction).toBe(policy);
		expect(declared?.definition.hasCompaction).toBe(true);
	});

	it("leaves an agent that declared none without one", () => {
		const [declared] = new NestComponentDiscovery().discover([
			{ providerName: "SupportAgent", metadata: { name: "support", description: "d" }, model: MODEL },
		]);

		expect(declared?.definition.compaction).toBeUndefined();
	});

	/**
	 * The README has promised this since limits existed, and the slot on the policies was
	 * being filled with nothing: an agent could declare a ceiling of its own and the run
	 * kept the module's.
	 */
	it("carries the run limits onto the definition", () => {
		const limits = new RunLimits(4, 2);

		const [declared] = new NestComponentDiscovery().discover([
			{ providerName: "SupportAgent", metadata: { name: "support", description: "d" }, model: MODEL, limits },
		]);

		expect(declared?.definition.limits).toBe(limits);
	});

	it("leaves an agent that declared no limits on the module's", () => {
		const [declared] = new NestComponentDiscovery().discover([
			{ providerName: "SupportAgent", metadata: { name: "support", description: "d" }, model: MODEL },
		]);

		expect(declared?.definition.limits).toBeUndefined();
	});

	it("carries the edges the decorators declared, by name", () => {
		const [declared] = new NestComponentDiscovery().discover([
			{
				providerName: "SupportAgent",
				metadata: { name: "support", description: "d" },
				model: MODEL,
				transfers: ["billing"],
				delegations: ["researcher"],
			},
		]);

		expect(declared?.definition.transfer.names).toEqual(["billing"]);
		expect(declared?.definition.delegation.names).toEqual(["researcher"]);
	});

	it("means no edges when the decorators were never used", () => {
		const [declared] = new NestComponentDiscovery().discover([
			{ providerName: "SupportAgent", metadata: { name: "support", description: "d" }, model: MODEL },
		]);

		expect(declared?.definition.transfer).toBeInstanceOf(AgentTransferPolicy);
		expect(declared?.definition.transfersToAnyone).toBe(false);
		expect(declared?.definition.delegatesToAnyone).toBe(false);
	});

	it("refuses a payload that is not agent metadata at all", () => {
		expect(() =>
			new NestComponentDiscovery().discover([{ providerName: "Broken", metadata: "nope", model: MODEL }]),
		).toThrow(InvalidAgentMetadataError);
	});

	it("refuses an agent with no model, naming the agent", () => {
		expect(() =>
			new NestComponentDiscovery().discover([
				{ providerName: "SupportAgent", metadata: { name: "support", description: "d" }, model: undefined },
			]),
		).toThrow(/support/);
	});
});
