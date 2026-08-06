import "reflect-metadata";
import { describe, expect, it } from "vitest";
import { z } from "zod";
import { SequentialFailoverPolicy } from "../../domain/agent/sequential-failover-policy";
import { TokenThresholdCompactionPolicy } from "../../domain/context/token-threshold-compaction-policy";
import { ScriptedModel } from "../../support/run/scripted-model.fixture";
import {
	AGENT_METADATA,
	DELEGATES_TO_METADATA,
	INLINE_SKILLS_METADATA,
	INLINE_TOOLS_METADATA,
	TOOL_METADATA,
	TRANSFERS_TO_METADATA,
} from "./metadata-keys";
import { NestAgentScanner } from "./nest-agent-scanner";
import { ScannedProvider } from "./scanned-provider";

const schema = z.object({ orderId: z.string() });
const MODEL = new ScriptedModel("default");

class LookupTool {
	public execute(): unknown {
		return { found: true };
	}
}
Reflect.defineMetadata(
	TOOL_METADATA,
	{ name: "lookup_order", description: "Finds.", schema, effect: "read" },
	LookupTool,
);

class SupportAgent {
	public refund(): unknown {
		return { refunded: true };
	}

	public tone(): string {
		return "Be brief.";
	}
}
Reflect.defineMetadata(
	AGENT_METADATA,
	{ name: "support", description: "Handles orders.", prompt: "Be helpful.", tools: [LookupTool] },
	SupportAgent,
);
Reflect.defineMetadata(
	INLINE_TOOLS_METADATA,
	[{ method: "refund", options: { description: "Refunds.", schema } }],
	SupportAgent,
);
Reflect.defineMetadata(
	INLINE_SKILLS_METADATA,
	[{ method: "tone", options: { name: "tone", description: "Tone.", mode: "always" } }],
	SupportAgent,
);
Reflect.defineMetadata(TRANSFERS_TO_METADATA, ["billing"], SupportAgent);
Reflect.defineMetadata(DELEGATES_TO_METADATA, ["researcher"], SupportAgent);

class PlainService {}

function scanned(): ScannedProvider[] {
	return [
		new ScannedProvider("LookupTool", LookupTool, new LookupTool()),
		new ScannedProvider("SupportAgent", SupportAgent, new SupportAgent()),
		new ScannedProvider("PlainService", PlainService, new PlainService()),
	];
}

describe("NestAgentScanner", () => {
	it("finds only what was declared an agent", () => {
		const found = new NestAgentScanner().scan(scanned(), MODEL);

		expect(found).toHaveLength(1);
		expect(found[0]?.providerName).toBe("SupportAgent");
	});

	it("gives the agent the shared tool it listed and the tool it declared itself", () => {
		const [agent] = new NestAgentScanner().scan(scanned(), MODEL);

		expect(agent?.tools?.map((tool) => tool.name)).toEqual(["lookup_order", "refund"]);
	});

	it("reads a skill declared on the agent", () => {
		const [agent] = new NestAgentScanner().scan(scanned(), MODEL);

		expect(agent?.skills?.map((skill) => skill.name)).toEqual(["tone"]);
		expect(agent?.skills?.[0]?.content).toBe("Be brief.");
	});

	it("passes the transfer and delegation payloads through unvalidated", () => {
		const [agent] = new NestAgentScanner().scan(scanned(), MODEL);

		expect(agent?.transfers).toEqual(["billing"]);
		expect(agent?.delegations).toEqual(["researcher"]);
	});

	it("falls back to the module's model for an agent that declared none", () => {
		const [agent] = new NestAgentScanner().scan(scanned(), MODEL);

		expect(agent?.model).toBe(MODEL);
	});

	it("takes the model instance an agent declared for itself", () => {
		const own = new ScriptedModel("own");
		class OwnModelAgent {}
		Reflect.defineMetadata(AGENT_METADATA, { name: "own", description: "d", model: own }, OwnModelAgent);

		const [agent] = new NestAgentScanner().scan(
			[new ScannedProvider("OwnModelAgent", OwnModelAgent, new OwnModelAgent())],
			MODEL,
		);

		expect(agent?.model).toBe(own);
	});

	it("takes the compaction policy an agent declared for itself", () => {
		const own = new TokenThresholdCompactionPolicy(1000, 400, 2);
		class CompactingAgent {}
		Reflect.defineMetadata(AGENT_METADATA, { name: "c", description: "d", compaction: own }, CompactingAgent);

		const [agent] = new NestAgentScanner().scan(
			[new ScannedProvider("CompactingAgent", CompactingAgent, new CompactingAgent())],
			MODEL,
		);

		expect(agent?.compaction).toBe(own);
	});

	/** Absent leaves the agent on the module's policy, which the runtime resolves later. */
	it("declares no compaction for an agent that asked for none", () => {
		const [agent] = new NestAgentScanner().scan(scanned(), MODEL);

		expect(agent?.compaction).toBeUndefined();
	});

	it("ignores a compaction that cannot decide anything", () => {
		class BrokenAgent {}
		Reflect.defineMetadata(AGENT_METADATA, { name: "b", description: "d", compaction: { limit: 10 } }, BrokenAgent);

		const [agent] = new NestAgentScanner().scan(
			[new ScannedProvider("BrokenAgent", BrokenAgent, new BrokenAgent())],
			MODEL,
		);

		expect(agent?.compaction).toBeUndefined();
	});

	it("turns the declared prompt into instructions", () => {
		const [agent] = new NestAgentScanner().scan(scanned(), MODEL);

		expect(agent?.instructions?.text).toBe("Be helpful.");
	});

	it("turns a declared list of models into a sequential failover walk", () => {
		class FailoverAgent {}
		Reflect.defineMetadata(
			AGENT_METADATA,
			{ name: "f", description: "d", failover: [new ScriptedModel("backup")] },
			FailoverAgent,
		);

		const [agent] = new NestAgentScanner().scan(
			[new ScannedProvider("FailoverAgent", FailoverAgent, new FailoverAgent())],
			MODEL,
		);

		expect(agent?.failover).toBeInstanceOf(SequentialFailoverPolicy);
	});

	it("keeps a declared failover policy as the policy it is", () => {
		const policy = new SequentialFailoverPolicy([new ScriptedModel("backup")]);
		class PolicyAgent {}
		Reflect.defineMetadata(AGENT_METADATA, { name: "p", description: "d", failover: policy }, PolicyAgent);

		const [agent] = new NestAgentScanner().scan(
			[new ScannedProvider("PolicyAgent", PolicyAgent, new PolicyAgent())],
			MODEL,
		);

		expect(agent?.failover).toBe(policy);
	});

	it("declares no failover when the list carries something that is not a model", () => {
		class BrokenFailoverAgent {}
		Reflect.defineMetadata(
			AGENT_METADATA,
			{ name: "bf", description: "d", failover: [{ notAModel: true }] },
			BrokenFailoverAgent,
		);

		const [agent] = new NestAgentScanner().scan(
			[new ScannedProvider("BrokenFailoverAgent", BrokenFailoverAgent, new BrokenFailoverAgent())],
			MODEL,
		);

		expect(agent?.failover).toBeUndefined();
	});
});
