import { describe, expect, it } from "vitest";
import { AgentRunId } from "../../common/identity/agent-run-id";
import { SessionId } from "../../common/identity/session-id";
import { ToolCallId } from "../../common/identity/tool-call-id";
import { AgentName } from "../../domain/agent/agent-name";
import { ToolInvocation } from "../../domain/tool/tool-invocation";
import { ToolCatalog } from "./tool-catalog";
import { ToolExecutionCommand } from "./tool-execution-command";

describe("ToolExecutionCommand", () => {
	it("carries the run, the agent and the tools that agent offers", () => {
		const command = new ToolExecutionCommand(
			SessionId.from("s-1"),
			AgentRunId.from("run-1"),
			AgentName.from("support"),
			ToolCatalog.empty(),
			new ToolInvocation(ToolCallId.from("c-1"), "refund", {}),
		);

		expect(command.agent.value).toBe("support");
		expect(command.catalog.isEmpty).toBe(true);
		expect(command.invocation.toolName).toBe("refund");
	});
});
