import { describe, expect, it } from "vitest";
import { AgentRunId } from "../../common/identity/agent-run-id.value-object";
import { SessionId } from "../../common/identity/session-id.value-object";
import { ToolCallId } from "../../common/identity/tool-call-id.value-object";
import { AgentName } from "../../domain/agent/agent-name.value-object";
import { ToolInvocation } from "../../domain/tool/invocation/tool-invocation.value-object";
import { RunContextFixture } from "../../support/run/run-context.fixture";
import { ToolCatalog } from "./tool-catalog.service";
import { ToolExecutionCommand } from "./tool-execution.command";

describe("ToolExecutionCommand", () => {
	it("carries the run, the agent and the tools that agent offers", () => {
		const command = new ToolExecutionCommand(
			RunContextFixture.run("s-1", { agent: AgentName.from("support") }),
			ToolCatalog.empty(),
			new ToolInvocation(ToolCallId.from("c-1"), "refund", {}),
		);

		expect(command.agent.value).toBe("support");
		expect(command.catalog.isEmpty).toBe(true);
		expect(command.invocation.toolName).toBe("refund");
	});
});
