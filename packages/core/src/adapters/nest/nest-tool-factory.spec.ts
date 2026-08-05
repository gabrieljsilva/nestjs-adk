import { describe, expect, it } from "vitest";
import { z } from "zod";
import { AgentRunId } from "../../common/identity/agent-run-id";
import { SessionId } from "../../common/identity/session-id";
import { ToolCallId } from "../../common/identity/tool-call-id";
import { AgentName } from "../../domain/agent/agent-name";
import { ToolContext } from "../../domain/tool/tool-context";
import { InvalidAgentMetadataError } from "./errors/invalid-agent-metadata.error";
import { NestToolFactory } from "./nest-tool-factory";

const schema = z.object({ orderId: z.string() });

function contextOf(): ToolContext {
	return new ToolContext(
		SessionId.from("s-1"),
		AgentRunId.from("r-1"),
		AgentName.from("support"),
		ToolCallId.from("c-1"),
	);
}

class LookupTool {
	public readonly prefix = "order";

	public execute(input: { orderId: string }): unknown {
		return { found: `${this.prefix} ${input.orderId}` };
	}
}

describe("NestToolFactory", () => {
	it("derives the declaration from the zod schema the tool declared", () => {
		const definition = new NestToolFactory().fromProvider(
			new LookupTool(),
			{ name: "lookup_order", description: "Finds an order.", schema, effect: "read" },
			"LookupTool",
		);

		expect(definition.name).toBe("lookup_order");
		expect(definition.effect.name).toBe("read");
		expect(JSON.stringify(definition.schema.declaration())).toContain("orderId");
	});

	it("calls the instance NestJS built, with its dependencies still reachable", async () => {
		const definition = new NestToolFactory().fromProvider(
			new LookupTool(),
			{ name: "lookup_order", description: "Finds an order.", schema },
			"LookupTool",
		);

		expect(await definition.handler.invoke({ orderId: "42" }, contextOf())).toEqual({ found: "order 42" });
	});

	it("takes a tool declared on the agent itself, named after the method", async () => {
		class SupportAgent {
			public async refund(input: { orderId: string }): Promise<unknown> {
				return { refunded: input.orderId };
			}
		}
		const agent = new SupportAgent();

		const definition = new NestToolFactory().fromMethod(
			agent,
			"refund",
			{ description: "Refunds.", schema },
			"SupportAgent",
		);

		expect(definition.name).toBe("refund");
		expect(await definition.handler.invoke({ orderId: "42" }, contextOf())).toEqual({ refunded: "42" });
	});

	it("hands the tool context to whoever asked for it", async () => {
		class ContextTool {
			public execute(_input: unknown, context: ToolContext): unknown {
				return { agent: context.agent.value };
			}
		}

		const definition = new NestToolFactory().fromProvider(
			new ContextTool(),
			{ name: "ctx", description: "d", schema },
			"ContextTool",
		);

		expect(await definition.handler.invoke({ orderId: "1" }, contextOf())).toEqual({ agent: "support" });
	});

	it("refuses a tool class with nothing to call", () => {
		expect(() =>
			new NestToolFactory().fromProvider({}, { name: "lookup_order", description: "d", schema }, "LookupTool"),
		).toThrow(InvalidAgentMetadataError);
	});
});
