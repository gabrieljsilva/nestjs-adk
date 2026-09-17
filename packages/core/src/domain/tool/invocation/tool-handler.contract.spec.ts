import { describe, expect, it } from "vitest";
import { AgentRunId } from "../../../common/identity/agent-run-id.value-object";
import { SessionId } from "../../../common/identity/session-id.value-object";
import { ToolCallId } from "../../../common/identity/tool-call-id.value-object";
import { AgentName } from "../../agent/agent-name.value-object";
import { ToolContext } from "./tool-context.value-object";
import { ToolHandler } from "./tool-handler.contract";

class EchoHandler extends ToolHandler {
	public async invoke(args: Record<string, unknown>, _context: ToolContext): Promise<unknown> {
		return args;
	}
}

const context = new ToolContext(
	SessionId.from("s-1"),
	AgentRunId.from("run-1"),
	AgentName.from("support"),
	ToolCallId.from("c-1"),
);

describe("ToolHandler", () => {
	it("receives the arguments and the context of the call", async () => {
		expect(await new EchoHandler().invoke({ orderId: "42" }, context)).toEqual({ orderId: "42" });
	});

	it("is the type the runtime depends on, whoever wrote the tool", () => {
		expect(new EchoHandler()).toBeInstanceOf(ToolHandler);
	});
});
