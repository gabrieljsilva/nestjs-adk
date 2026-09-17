import { describe, expect, it } from "vitest";
import { AgentRunId } from "../../../common/identity/agent-run-id.value-object";
import { SessionId } from "../../../common/identity/session-id.value-object";
import { ToolCallId } from "../../../common/identity/tool-call-id.value-object";
import { AgentName } from "../../agent/agent-name.value-object";
import { ToolContext } from "./tool-context.value-object";

function contextOf(signal?: AbortSignal): ToolContext {
	return new ToolContext(
		SessionId.from("s-1"),
		AgentRunId.from("run-1"),
		AgentName.from("support"),
		ToolCallId.from("c-1"),
		signal,
	);
}

describe("ToolContext", () => {
	it("tells the tool which run it belongs to", () => {
		const context = contextOf();

		expect(context.sessionId.value).toBe("s-1");
		expect(context.runId.value).toBe("run-1");
		expect(context.callId.value).toBe("c-1");
	});

	it("is not cancelled when nobody handed it a signal", () => {
		expect(contextOf().isCancelled).toBe(false);
	});

	it("reports the cancellation the run already decided on", () => {
		const controller = new AbortController();
		const context = contextOf(controller.signal);

		controller.abort("draining");

		expect(context.isCancelled).toBe(true);
	});
});
