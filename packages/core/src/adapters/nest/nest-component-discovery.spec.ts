import { describe, expect, it } from "vitest";
import { AgentTransferPolicy } from "../../domain/agent/agent-transfer-policy";
import { ScriptedModel } from "../../support/run/scripted-model.fixture";
import { InvalidAgentMetadataError } from "./errors/invalid-agent-metadata.error";
import { NestComponentDiscovery } from "./nest-component-discovery";

const MODEL = new ScriptedModel("primary");

describe("NestComponentDiscovery", () => {
	it("turns a validated payload into a definition", () => {
		const [declared] = new NestComponentDiscovery().discover([
			{ providerName: "SupportAgent", metadata: { name: "support", description: "Handles orders." }, model: MODEL },
		]);

		expect(declared?.definition.name.value).toBe("support");
		expect(declared?.providerName).toBe("SupportAgent");
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
