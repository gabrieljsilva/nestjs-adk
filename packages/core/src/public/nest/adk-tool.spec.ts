import "reflect-metadata";
import { describe, expect, it } from "vitest";
import { z } from "zod";
import { TOOL_METADATA } from "../../adapters/nest/metadata-keys";
import { NestToolFactory } from "../../adapters/nest/nest-tool-factory";
import { AgentRunId } from "../../common/identity/agent-run-id";
import { SessionId } from "../../common/identity/session-id";
import { ToolCallId } from "../../common/identity/tool-call-id";
import { AgentName } from "../../domain/agent/agent-name";
import { ToolContext } from "../../domain/tool/tool-context";
import { AdkTool } from "./adk-tool";
import { Tool } from "./decorators/tool.decorator";

const schema = z.object({ orderId: z.string(), copies: z.number().int().default(1) });

function contextOf(): ToolContext {
	return new ToolContext(
		SessionId.from("s-1"),
		AgentRunId.from("r-1"),
		AgentName.from("support"),
		ToolCallId.from("c-1"),
	);
}

@Tool({ name: "find_order", description: "Finds an order.", schema, effect: "read" })
class FindOrderTool extends AdkTool<typeof schema> {
	public constructor(private readonly prefix: string) {
		super();
	}

	public execute(input: z.infer<typeof schema>, context: ToolContext): unknown {
		return { found: `${this.prefix} ${input.orderId}`, copies: input.copies, session: context.sessionId.value };
	}
}

/** A tool that has no use for the run it is inside, which is the common case. */
@Tool({ name: "count_copies", description: "Counts copies.", schema })
class CountCopiesTool extends AdkTool<typeof schema> {
	public execute(input: z.infer<typeof schema>): unknown {
		return input.copies;
	}
}

describe("AdkTool", () => {
	it("answers with what the schema parsed and what the run knows", () => {
		expect(new FindOrderTool("order").execute({ orderId: "A-1042", copies: 2 }, contextOf())).toEqual({
			found: "order A-1042",
			copies: 2,
			session: "s-1",
		});
	});

	it("is the entry point the runtime resolves, dependencies and all", async () => {
		const definition = new NestToolFactory().fromProvider(
			new FindOrderTool("order"),
			Reflect.getMetadata(TOOL_METADATA, FindOrderTool),
			"FindOrderTool",
		);

		expect(definition.name).toBe("find_order");
		expect(await definition.handler.invoke({ orderId: "A-1042", copies: 1 }, contextOf())).toEqual({
			found: "order A-1042",
			copies: 1,
			session: "s-1",
		});
	});

	it("lets a tool that never looks at the run declare the input alone", async () => {
		const definition = new NestToolFactory().fromProvider(
			new CountCopiesTool(),
			Reflect.getMetadata(TOOL_METADATA, CountCopiesTool),
			"CountCopiesTool",
		);

		expect(await definition.handler.invoke({ orderId: "A-1042", copies: 3 }, contextOf())).toBe(3);
	});

	it("marks the class as a provider, so NestJS builds it like any other", () => {
		expect(Reflect.getMetadata("__injectable__", FindOrderTool)).toBe(true);
	});
});
