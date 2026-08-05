import { describe, expect, it } from "vitest";
import { ToolCallId } from "../../common/identity/tool-call-id";
import { AgentRunSuspended } from "../../domain/event/catalog/agent-run-suspended";
import { ToolApprovalDenied } from "../../domain/event/catalog/tool-approval-denied";
import { ToolApprovalGranted } from "../../domain/event/catalog/tool-approval-granted";
import { ToolResultProduced } from "../../domain/event/catalog/tool-result-produced";
import { ModelChunk } from "../../domain/model/model-chunk";
import { ToolCallDelta } from "../../domain/model/tool-call-delta";
import { AgentRunStatus } from "../../domain/session/agent-run-status";
import { AskInput } from "../../domain/session/ask-input";
import { ApprovalNotPendingError } from "../../domain/session/errors/approval-not-pending.error";
import { EffectApprovalPolicy } from "../../domain/tool/effect-approval-policy";
import { ParsedArguments } from "../../domain/tool/parsed-arguments";
import { ToolDefinition } from "../../domain/tool/tool-definition";
import { ToolEffect } from "../../domain/tool/tool-effect";
import { ToolHandler } from "../../domain/tool/tool-handler";
import { ToolSchema } from "../../domain/tool/tool-schema";
import { NativeStackFixture } from "../../support/run/native-stack.fixture";
import { TurnScriptModel } from "../../support/run/turn-script-model.fixture";
import { AgentRunCommand } from "./agent-run-command";

const SUPPORT = NativeStackFixture.AGENT;
const REFUND = ToolCallId.from("c-1");
const CLOSE = ToolCallId.from("c-2");

class AnySchema extends ToolSchema {
	public declaration(): unknown {
		return { type: "object" };
	}

	public parse(): ParsedArguments {
		return ParsedArguments.valid({});
	}
}

class CountingHandler extends ToolHandler {
	public calls = 0;

	public async invoke(): Promise<unknown> {
		this.calls += 1;
		return { done: true };
	}
}

function toolOf(name: string, handler: ToolHandler, effect: ToolEffect): ToolDefinition {
	return new ToolDefinition(name, "does something", new AnySchema(), effect, handler);
}

/** One turn with two calls, then a plain answer once they have results. */
function twoCallModel(first: string, second: string): TurnScriptModel {
	return new TurnScriptModel([
		[
			ModelChunk.toolCall(new ToolCallDelta(0, "{}", "c-1", first)),
			ModelChunk.toolCall(new ToolCallDelta(1, "{}", "c-2", second)),
			ModelChunk.finish("tool_calls"),
		],
		[ModelChunk.text("done"), ModelChunk.finish("stop")],
	]);
}

function stackOf(model: TurnScriptModel, tools: readonly ToolDefinition[]): NativeStackFixture {
	return new NativeStackFixture(
		model,
		NativeStackFixture.definitionOf(model, undefined, tools),
		EffectApprovalPolicy.from(ToolEffect.WRITE),
	);
}

describe("DecideApproval", () => {
	it("runs every call of the turn once the held one is granted, and leaves none without a result", async () => {
		const lookup = new CountingHandler();
		const refund = new CountingHandler();
		const stack = stackOf(twoCallModel("lookup_order", "refund_order"), [
			toolOf("lookup_order", lookup, ToolEffect.READ),
			toolOf("refund_order", refund, ToolEffect.WRITE),
		]);
		const suspended = await stack.runner.ask(new AgentRunCommand(SUPPORT, AskInput.of("refund order 42")));

		const resumed = await stack.deciding.handle(suspended.sessionId, CLOSE, "granted", "gabriel");

		expect(lookup.calls).toBe(1);
		expect(refund.calls).toBe(1);
		expect(resumed.status.equals(AgentRunStatus.COMPLETED)).toBe(true);
	});

	it("stays suspended while another held call of the same turn is still unanswered", async () => {
		const refund = new CountingHandler();
		const close = new CountingHandler();
		const stack = stackOf(twoCallModel("refund_order", "close_order"), [
			toolOf("refund_order", refund, ToolEffect.WRITE),
			toolOf("close_order", close, ToolEffect.WRITE),
		]);
		const suspended = await stack.runner.ask(new AgentRunCommand(SUPPORT, AskInput.of("refund and close 42")));

		const half = await stack.deciding.handle(suspended.sessionId, REFUND, "granted");

		expect(half.status.equals(AgentRunStatus.SUSPENDED)).toBe(true);
		expect(refund.calls).toBe(0);
		expect(close.calls).toBe(0);
	});

	it("records the decision even on the run that did not release the turn", async () => {
		const stack = stackOf(twoCallModel("refund_order", "close_order"), [
			toolOf("refund_order", new CountingHandler(), ToolEffect.WRITE),
			toolOf("close_order", new CountingHandler(), ToolEffect.WRITE),
		]);
		const suspended = await stack.runner.ask(new AgentRunCommand(SUPPORT, AskInput.of("refund and close 42")));

		await stack.deciding.handle(suspended.sessionId, REFUND, "granted");

		const types = (await stack.journalOf(suspended.sessionId)).map((event) => event.type);
		expect(types).toContain(ToolApprovalGranted.TYPE);
		expect(types.at(-1)).toBe(AgentRunSuspended.TYPE);
	});

	it("answers a denied call with the refusal and runs the granted one, in the same turn", async () => {
		const refund = new CountingHandler();
		const close = new CountingHandler();
		const stack = stackOf(twoCallModel("refund_order", "close_order"), [
			toolOf("refund_order", refund, ToolEffect.WRITE),
			toolOf("close_order", close, ToolEffect.WRITE),
		]);
		const suspended = await stack.runner.ask(new AgentRunCommand(SUPPORT, AskInput.of("refund and close 42")));
		await stack.deciding.handle(suspended.sessionId, REFUND, "granted");

		await stack.deciding.handle(suspended.sessionId, CLOSE, "denied", "gabriel", "the order stays open");

		expect(refund.calls).toBe(1);
		expect(close.calls).toBe(0);
		const journal = await stack.journalOf(suspended.sessionId);
		expect(journal.map((event) => event.type)).toContain(ToolApprovalDenied.TYPE);
		const refusal = journal.find(
			(event): event is ToolResultProduced => event instanceof ToolResultProduced && event.failed,
		);
		expect(refusal?.output.error).toBe("the order stays open");
	});

	it("refuses a decision that arrives twice, so an approved tool never runs again", async () => {
		const refund = new CountingHandler();
		const stack = stackOf(twoCallModel("lookup_order", "refund_order"), [
			toolOf("lookup_order", new CountingHandler(), ToolEffect.READ),
			toolOf("refund_order", refund, ToolEffect.WRITE),
		]);
		const suspended = await stack.runner.ask(new AgentRunCommand(SUPPORT, AskInput.of("refund order 42")));
		await stack.deciding.handle(suspended.sessionId, CLOSE, "granted");

		const error = await stack.deciding.handle(suspended.sessionId, CLOSE, "granted").catch((reason) => reason);

		expect(error).toBeInstanceOf(ApprovalNotPendingError);
		expect(refund.calls).toBe(1);
	});

	it("refuses a decision on a call nobody ever had to answer for", async () => {
		const stack = stackOf(twoCallModel("lookup_order", "refund_order"), [
			toolOf("lookup_order", new CountingHandler(), ToolEffect.READ),
			toolOf("refund_order", new CountingHandler(), ToolEffect.WRITE),
		]);
		const suspended = await stack.runner.ask(new AgentRunCommand(SUPPORT, AskInput.of("refund order 42")));

		const error = await stack.deciding.handle(suspended.sessionId, REFUND, "granted").catch((reason) => reason);

		expect(error).toBeInstanceOf(ApprovalNotPendingError);
	});
});
