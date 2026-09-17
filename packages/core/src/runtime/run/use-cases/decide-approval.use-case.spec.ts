import { describe, expect, it } from "vitest";
import { ToolCallId } from "../../../common/identity/tool-call-id.value-object";
import { ToolCallObserver } from "../../../contracts/tool/tool-call-observer.contract";
import { ToolApprovalDenied } from "../../../domain/event/catalog/approval/tool-approval-denied.event";
import { ToolApprovalGranted } from "../../../domain/event/catalog/approval/tool-approval-granted.event";
import { AgentRunSuspended } from "../../../domain/event/catalog/run/agent-run-suspended.event";
import { ToolResultProduced } from "../../../domain/event/catalog/tool/tool-result-produced.event";
import { ModelChunk } from "../../../domain/model/streaming/model-chunk.value-object";
import { ToolCallDelta } from "../../../domain/model/streaming/tool-call-delta.value-object";
import type { RunContext } from "../../../domain/run/run-context.value-object";
import { ApprovalNotPendingError } from "../../../domain/session/errors/approval-not-pending.error";
import { AskInput } from "../../../domain/session/input/ask-input.command";
import { AgentRunStatus } from "../../../domain/session/run/agent-run-status.value-object";
import { EffectApprovalPolicy } from "../../../domain/tool/approval/effect-approval.policy";
import { ToolEffect } from "../../../domain/tool/approval/tool-effect.value-object";
import { ParsedArguments } from "../../../domain/tool/invocation/parsed-arguments.value-object";
import { ToolHandler } from "../../../domain/tool/invocation/tool-handler.contract";
import type { ToolCallNotice } from "../../../domain/tool/notice/tool-call.notice";
import type { ToolResultNotice } from "../../../domain/tool/notice/tool-result.notice";
import { ToolDefinition } from "../../../domain/tool/tool-definition.value-object";
import { ToolSchema } from "../../../domain/tool/tool-schema.contract";
import { NativeStackFixture } from "../../../support/run/native-stack.fixture";
import { TurnScriptModel } from "../../../support/run/turn-script-model.fixture";
import { AgentRunCommand } from "../agent-run.command";

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
		NativeStackFixture.buildDefinition(model, undefined, tools),
		EffectApprovalPolicy.from(ToolEffect.WRITE),
	);
}

class LoggingObserver extends ToolCallObserver {
	public readonly requests: ToolCallNotice[] = [];
	public readonly results: ToolResultNotice[] = [];

	public requested(_context: RunContext, call: ToolCallNotice): void {
		this.requests.push(call);
	}

	public settled(_context: RunContext, result: ToolResultNotice): void {
		this.results.push(result);
	}
}

describe("DecideApprovalUseCase", () => {
	it("tells the observer of the decision how each call of the released turn settled, without asking again", async () => {
		const refund = new CountingHandler();
		const close = new CountingHandler();
		const stack = stackOf(twoCallModel("refund_order", "close_order"), [
			toolOf("refund_order", refund, ToolEffect.WRITE),
			toolOf("close_order", close, ToolEffect.WRITE),
		]);
		const suspended = await stack.runner.ask(new AgentRunCommand(SUPPORT, AskInput.fromMessage("refund and close 42")));
		await stack.deciding.execute(suspended.sessionId, REFUND, "granted");
		const observer = new LoggingObserver();

		await stack.deciding.execute(suspended.sessionId, CLOSE, "denied", {
			by: "gabriel",
			reason: "the order stays open",
			toolCalls: observer,
		});

		expect(observer.requests).toHaveLength(0);
		expect(observer.results.map((result) => result.toolName)).toEqual(["refund_order", "close_order"]);
		expect(observer.results[0]?.failed).toBe(false);
		expect(observer.results[1]?.isRefused).toBe(true);
		expect(observer.results[1]?.reason).toBe("the order stays open");
	});

	it("runs every call of the turn once the held one is granted, and leaves none without a result", async () => {
		const lookup = new CountingHandler();
		const refund = new CountingHandler();
		const stack = stackOf(twoCallModel("lookup_order", "refund_order"), [
			toolOf("lookup_order", lookup, ToolEffect.READ),
			toolOf("refund_order", refund, ToolEffect.WRITE),
		]);
		const suspended = await stack.runner.ask(new AgentRunCommand(SUPPORT, AskInput.fromMessage("refund order 42")));

		const resumed = await stack.deciding.execute(suspended.sessionId, CLOSE, "granted", { by: "gabriel" });

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
		const suspended = await stack.runner.ask(new AgentRunCommand(SUPPORT, AskInput.fromMessage("refund and close 42")));

		const half = await stack.deciding.execute(suspended.sessionId, REFUND, "granted");

		expect(half.status.equals(AgentRunStatus.SUSPENDED)).toBe(true);
		expect(refund.calls).toBe(0);
		expect(close.calls).toBe(0);
	});

	it("records the decision even on the run that did not release the turn", async () => {
		const stack = stackOf(twoCallModel("refund_order", "close_order"), [
			toolOf("refund_order", new CountingHandler(), ToolEffect.WRITE),
			toolOf("close_order", new CountingHandler(), ToolEffect.WRITE),
		]);
		const suspended = await stack.runner.ask(new AgentRunCommand(SUPPORT, AskInput.fromMessage("refund and close 42")));

		await stack.deciding.execute(suspended.sessionId, REFUND, "granted");

		const types = (await stack.readJournal(suspended.sessionId)).map((event) => event.type);
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
		const suspended = await stack.runner.ask(new AgentRunCommand(SUPPORT, AskInput.fromMessage("refund and close 42")));
		await stack.deciding.execute(suspended.sessionId, REFUND, "granted");

		await stack.deciding.execute(suspended.sessionId, CLOSE, "denied", { by: "gabriel", reason: "the order stays open" });

		expect(refund.calls).toBe(1);
		expect(close.calls).toBe(0);
		const journal = await stack.readJournal(suspended.sessionId);
		expect(journal.map((event) => event.type)).toContain(ToolApprovalDenied.TYPE);
		const refusal = journal.find(
			(event): event is ToolResultProduced => event instanceof ToolResultProduced && event.failed,
		);
		expect(refusal?.output).toEqual({ refused: true, reason: "the order stays open" });
	});

	it("refuses a decision that arrives twice, so an approved tool never runs again", async () => {
		const refund = new CountingHandler();
		const stack = stackOf(twoCallModel("lookup_order", "refund_order"), [
			toolOf("lookup_order", new CountingHandler(), ToolEffect.READ),
			toolOf("refund_order", refund, ToolEffect.WRITE),
		]);
		const suspended = await stack.runner.ask(new AgentRunCommand(SUPPORT, AskInput.fromMessage("refund order 42")));
		await stack.deciding.execute(suspended.sessionId, CLOSE, "granted");

		const error = await stack.deciding.execute(suspended.sessionId, CLOSE, "granted").catch((reason) => reason);

		expect(error).toBeInstanceOf(ApprovalNotPendingError);
		expect(refund.calls).toBe(1);
	});

	it("refuses a decision on a call nobody ever had to answer for", async () => {
		const stack = stackOf(twoCallModel("lookup_order", "refund_order"), [
			toolOf("lookup_order", new CountingHandler(), ToolEffect.READ),
			toolOf("refund_order", new CountingHandler(), ToolEffect.WRITE),
		]);
		const suspended = await stack.runner.ask(new AgentRunCommand(SUPPORT, AskInput.fromMessage("refund order 42")));

		const error = await stack.deciding.execute(suspended.sessionId, REFUND, "granted").catch((reason) => reason);

		expect(error).toBeInstanceOf(ApprovalNotPendingError);
	});
});
