import "reflect-metadata";
import { describe, expect, it } from "vitest";
import { z } from "zod";
import { SequentialFailoverPolicy } from "../../domain/agent/sequential-failover-policy";
import { TokenThresholdCompactionPolicy } from "../../domain/context/token-threshold-compaction-policy";
import { ScriptedModel } from "../../support/run/scripted-model.fixture";
import { InvalidAgentMetadataError } from "./errors/invalid-agent-metadata.error";
import { UnregisteredToolError } from "./errors/unregistered-tool.error";
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

	/**
	 * A listed tool nobody registered used to leave a shorter list and no complaint.
	 *
	 * The agent still boots, still answers, and is simply missing the tool it exists to call,
	 * which surfaces as a model that will not do its job rather than as a wiring mistake. The
	 * usual cause is a class in `tools` and not in `providers`, so the message names both what
	 * was asked for and what the container actually declared.
	 */
	it("refuses an agent that lists a tool the container never declared", () => {
		const orphan = [new ScannedProvider("SupportAgent", SupportAgent, new SupportAgent())];

		expect(() => new NestAgentScanner().scan(orphan, MODEL)).toThrow(UnregisteredToolError);
		expect(() => new NestAgentScanner().scan(orphan, MODEL)).toThrow(/SupportAgent lists LookupTool/);
	});

	it("names the tools it did find, which is where the missing one was expected to be", () => {
		const orphan = [new ScannedProvider("SupportAgent", SupportAgent, new SupportAgent())];

		expect(() => new NestAgentScanner().scan(orphan, MODEL)).toThrow(/Registered tools: none/);
	});

	/**
	 * The half of the message that helps: a tool that IS registered, listed next to the one
	 * that is not. The usual cause is a class in `tools` and not in `providers`, and seeing
	 * what did resolve is what tells the reader which of the two mistakes they made.
	 */
	it("lists the tools that did resolve, so the missing one stands out among them", () => {
		class OtherAgent {}
		Reflect.defineMetadata(
			AGENT_METADATA,
			{ name: "other", description: "Lists a stranger.", tools: [PlainService] },
			OtherAgent,
		);
		const providers = [
			new ScannedProvider("LookupTool", LookupTool, new LookupTool()),
			new ScannedProvider("OtherAgent", OtherAgent, new OtherAgent()),
		];

		expect(() => new NestAgentScanner().scan(providers, MODEL)).toThrow(/Registered tools: lookup_order/);
		expect(() => new NestAgentScanner().scan(providers, MODEL)).toThrow(/lists PlainService/);
	});

	/** A name where a class belongs: the mistake of reading `tools` as the names the model calls. */
	it("refuses a tool listed by name instead of by class, and prints the name", () => {
		class NamingAgent {}
		Reflect.defineMetadata(
			AGENT_METADATA,
			{ name: "naming", description: "Lists a string.", tools: ["lookup_order"] },
			NamingAgent,
		);

		expect(() =>
			new NestAgentScanner().scan([new ScannedProvider("NamingAgent", NamingAgent, new NamingAgent())], MODEL),
		).toThrow(/lists lookup_order among its tools/);
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

	/**
	 * Declared and wrong is not the same as absent, and the difference is the whole rule.
	 *
	 * An agent that says nothing about compaction gets the module's policy, which is what the
	 * default is for. An agent that declares one the runtime cannot use would get the same
	 * thing, silently, while the developer believes the agent is configured. That is the case
	 * worth a boot failure: nothing downstream can tell the two apart.
	 */
	it("refuses a compaction that cannot decide anything", () => {
		class BrokenAgent {}
		Reflect.defineMetadata(AGENT_METADATA, { name: "b", description: "d", compaction: { limit: 10 } }, BrokenAgent);

		const scan = () =>
			new NestAgentScanner().scan([new ScannedProvider("BrokenAgent", BrokenAgent, new BrokenAgent())], MODEL);

		expect(scan).toThrow(InvalidAgentMetadataError);
		expect(scan).toThrow(/BrokenAgent.*compaction cannot decide anything/);
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

	/** One bad entry used to cancel the whole chain, so a typo left the agent with no failover. */
	it("refuses a failover list carrying something that is not a model, and says which entry", () => {
		class BrokenFailoverAgent {}
		Reflect.defineMetadata(
			AGENT_METADATA,
			{ name: "bf", description: "d", failover: [MODEL, { notAModel: true }] },
			BrokenFailoverAgent,
		);

		const scan = () =>
			new NestAgentScanner().scan(
				[new ScannedProvider("BrokenFailoverAgent", BrokenFailoverAgent, new BrokenFailoverAgent())],
				MODEL,
			);

		expect(scan).toThrow(InvalidAgentMetadataError);
		expect(scan).toThrow(/failover entry 1 is not a model/);
	});

	it("refuses a model that is the name of one instead of one", () => {
		class NamedModelAgent {}
		Reflect.defineMetadata(AGENT_METADATA, { name: "nm", description: "d", model: "gpt-5.6-luna" }, NamedModelAgent);

		const scan = () =>
			new NestAgentScanner().scan([new ScannedProvider("NamedModelAgent", NamedModelAgent, new NamedModelAgent())], MODEL);

		expect(scan).toThrow(/model is not a model/);
	});

	it("refuses a prompt that is not a string", () => {
		class NumericPromptAgent {}
		Reflect.defineMetadata(AGENT_METADATA, { name: "np", description: "d", prompt: 42 }, NumericPromptAgent);

		const scan = () =>
			new NestAgentScanner().scan(
				[new ScannedProvider("NumericPromptAgent", NumericPromptAgent, new NumericPromptAgent())],
				MODEL,
			);

		expect(scan).toThrow(/prompt is not a string/);
	});

	/** The other half of the rule: saying nothing still means the default, for every field. */
	it("leaves an agent that declared none of the optional fields on the defaults", () => {
		class BareAgent {}
		Reflect.defineMetadata(AGENT_METADATA, { name: "bare", description: "d" }, BareAgent);

		const [agent] = new NestAgentScanner().scan([new ScannedProvider("BareAgent", BareAgent, new BareAgent())], MODEL);

		expect(agent?.model).toBe(MODEL);
		expect(agent?.failover).toBeUndefined();
		expect(agent?.compaction).toBeUndefined();
		expect(agent?.instructions).toBeUndefined();
		expect(agent?.tools).toEqual([]);
	});
});
