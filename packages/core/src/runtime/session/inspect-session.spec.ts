import { describe, expect, it } from "vitest";
import { SessionId } from "../../common/identity/session-id";
import { ToolCallId } from "../../common/identity/tool-call-id";
import { ModelChunk } from "../../domain/model/model-chunk";
import { ToolCallDelta } from "../../domain/model/tool-call-delta";
import { AskInput } from "../../domain/session/ask-input";
import { SessionNotFoundError } from "../../domain/session/errors/session-not-found.error";
import { EffectApprovalPolicy } from "../../domain/tool/effect-approval-policy";
import { ParsedArguments } from "../../domain/tool/parsed-arguments";
import { ToolDefinition } from "../../domain/tool/tool-definition";
import { ToolEffect } from "../../domain/tool/tool-effect";
import { ToolHandler } from "../../domain/tool/tool-handler";
import { ToolSchema } from "../../domain/tool/tool-schema";
import { NativeStackFixture } from "../../support/run/native-stack.fixture";
import { TurnScriptModel } from "../../support/run/turn-script-model.fixture";
import { AgentRunCommand } from "../run/agent-run-command";
import { InspectSession } from "./inspect-session";
import { SessionManager } from "./session-manager";

const SUPPORT = NativeStackFixture.AGENT;
const REFUND = ToolCallId.from("c-1");

class AnySchema extends ToolSchema {
	public declaration(): unknown {
		return { type: "object" };
	}

	public parse(): ParsedArguments {
		return ParsedArguments.valid({ orderId: "42" });
	}
}

class SilentHandler extends ToolHandler {
	public async invoke(): Promise<unknown> {
		return { done: true };
	}
}

function refundTool(): ToolDefinition {
	return new ToolDefinition("refund_order", "Refunds an order", new AnySchema(), ToolEffect.WRITE, new SilentHandler());
}

function askingModel(): TurnScriptModel {
	return new TurnScriptModel([
		[
			ModelChunk.toolCall(new ToolCallDelta(0, JSON.stringify({ orderId: "42" }), "c-1", "refund_order")),
			ModelChunk.finish("tool_calls"),
		],
		[ModelChunk.text("done"), ModelChunk.finish("stop")],
	]);
}

function suspendingStack(): NativeStackFixture {
	const model = askingModel();
	return new NativeStackFixture(
		model,
		NativeStackFixture.definitionOf(model, undefined, [refundTool()]),
		EffectApprovalPolicy.from(ToolEffect.WRITE),
	);
}

describe("InspectSession", () => {
	it("says what a suspended session is waiting on, to a caller that ran nothing", async () => {
		const stack = suspendingStack();
		const suspended = await stack.runner.ask(new AgentRunCommand(SUPPORT, AskInput.of("refund order 42")));

		const inspection = await new InspectSession(stack.sessions).handle(suspended.sessionId);

		expect(inspection.isAwaitingApproval).toBe(true);
		expect(inspection.approval.awaiting[0]?.callId.value).toBe(REFUND.value);
		expect(inspection.approval.awaiting[0]?.args).toEqual({ orderId: "42" });
	});

	it("answers the same to a reader that never saw the run, since it reads the journal", async () => {
		const stack = suspendingStack();
		const suspended = await stack.runner.ask(new AgentRunCommand(SUPPORT, AskInput.of("refund order 42")));
		const elsewhere = new SessionManager(stack.storage);

		const inspection = await new InspectSession(elsewhere).handle(suspended.sessionId);

		expect(inspection.isAwaitingApproval).toBe(true);
		expect(inspection.approval.awaiting[0]?.toolName).toBe("refund_order");
		expect(inspection.activeAgent.value).toBe(SUPPORT.value);
	});

	it("says nobody is waiting once the decision released the turn", async () => {
		const stack = suspendingStack();
		const suspended = await stack.runner.ask(new AgentRunCommand(SUPPORT, AskInput.of("refund order 42")));
		await stack.deciding.handle(suspended.sessionId, REFUND, "granted", "gabriel");

		const inspection = await new InspectSession(stack.sessions).handle(suspended.sessionId);

		expect(inspection.isAwaitingApproval).toBe(false);
	});

	it("moves the revision as the journal moves, which is what tells one read from the next", async () => {
		const stack = suspendingStack();
		const suspended = await stack.runner.ask(new AgentRunCommand(SUPPORT, AskInput.of("refund order 42")));
		const before = await new InspectSession(stack.sessions).handle(suspended.sessionId);

		await stack.deciding.handle(suspended.sessionId, REFUND, "granted");
		const after = await new InspectSession(stack.sessions).handle(suspended.sessionId);

		expect(after.revision.value).toBeGreaterThan(before.revision.value);
	});

	it("refuses a session that was never created, rather than answering it as empty", async () => {
		const stack = suspendingStack();

		const error = await new InspectSession(stack.sessions)
			.handle(SessionId.from("never-created"))
			.catch((reason: unknown) => reason);

		expect(error).toBeInstanceOf(SessionNotFoundError);
	});
});
