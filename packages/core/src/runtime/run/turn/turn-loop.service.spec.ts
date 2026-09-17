import { beforeEach, describe, expect, it } from "vitest";
import { ToolCallId } from "../../../common/identity/tool-call-id.value-object";
import { ToolCallObserver } from "../../../contracts/tool/tool-call-observer.contract";
import { ToolApprovalRequested } from "../../../domain/event/catalog/approval/tool-approval-requested.event";
import { AgentRunCompleted } from "../../../domain/event/catalog/run/agent-run-completed.event";
import { AgentRunSuspended } from "../../../domain/event/catalog/run/agent-run-suspended.event";
import { ToolCallRequested } from "../../../domain/event/catalog/tool/tool-call-requested.event";
import { ToolResultProduced } from "../../../domain/event/catalog/tool/tool-result-produced.event";
import { EmptyModelResponseError } from "../../../domain/model/errors/empty-model-response.error";
import { ModelChunk } from "../../../domain/model/streaming/model-chunk.value-object";
import { ToolCallDelta } from "../../../domain/model/streaming/tool-call-delta.value-object";
import type { RunContext } from "../../../domain/run/run-context.value-object";
import { AgentMaxIterationsError } from "../../../domain/session/errors/agent-max-iterations.error";
import { AskInput } from "../../../domain/session/input/ask-input.command";
import { AgentRunStatus } from "../../../domain/session/run/agent-run-status.value-object";
import { RunLimits } from "../../../domain/session/run/run-limits.value-object";
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
		return { status: "shipped" };
	}
}

function toolOf(handler: ToolHandler, effect = ToolEffect.READ): ToolDefinition {
	return new ToolDefinition("lookup_order", "Looks an order up", new AnySchema(), effect, handler);
}

function callsThenAnswers(): TurnScriptModel {
	return new TurnScriptModel([
		[ModelChunk.toolCall(new ToolCallDelta(0, "{}", "c-1", "lookup_order")), ModelChunk.finish("tool_calls")],
		[ModelChunk.text("the order is shipped"), ModelChunk.finish("stop")],
	]);
}

/** Writes down what it was told and when, next to what the tool did, because the order is the contract. */
class LoggingObserver extends ToolCallObserver {
	public readonly requests: ToolCallNotice[] = [];
	public readonly results: ToolResultNotice[] = [];

	public constructor(private readonly log: string[] = []) {
		super();
	}

	public requested(_context: RunContext, call: ToolCallNotice): void {
		this.log.push(`requested ${call.toolName}`);
		this.requests.push(call);
	}

	public settled(_context: RunContext, result: ToolResultNotice): void {
		this.log.push(`settled ${result.toolName}`);
		this.results.push(result);
	}
}

let handler: CountingHandler;

beforeEach(() => {
	handler = new CountingHandler();
});

function stackOf(model: TurnScriptModel, effect = ToolEffect.READ, approvals = EffectApprovalPolicy.never()) {
	return new NativeStackFixture(
		model,
		NativeStackFixture.buildDefinition(model, undefined, [toolOf(handler, effect)]),
		approvals,
	);
}

describe("TurnLoop", () => {
	it("calls the tool the model asked for and goes back with the result", async () => {
		const stack = stackOf(callsThenAnswers());

		const result = await stack.runner.ask(
			new AgentRunCommand({
				agent: SUPPORT,
				input: AskInput.fromMessage("where is order 42?"),
			}),
		);

		expect(handler.calls).toBe(1);
		expect(result.text).toBe("the order is shipped");
	});

	it("journals what the model asked for before the tool runs, and the result after it", async () => {
		const stack = stackOf(callsThenAnswers());

		const result = await stack.runner.ask(
			new AgentRunCommand({
				agent: SUPPORT,
				input: AskInput.fromMessage("where is order 42?"),
			}),
		);

		const types = (await stack.readJournal(result.sessionId)).map((event) => event.type);
		expect(types.indexOf(ToolCallRequested.TYPE)).toBeLessThan(types.indexOf(ToolResultProduced.TYPE));
		expect(types.at(-1)).toBe(AgentRunCompleted.TYPE);
	});

	it("stops at the iteration limit rather than going round on somebody's bill", async () => {
		const forever = new TurnScriptModel([
			[ModelChunk.toolCall(new ToolCallDelta(0, "{}", "c-1", "lookup_order")), ModelChunk.finish("tool_calls")],
		]);
		const stack = stackOf(forever);

		const error = await stack.runner
			.ask(
				new AgentRunCommand({
					agent: SUPPORT,
					input: AskInput.fromMessage("loop please"),
					limits: new RunLimits(2),
				}),
			)
			.catch((reason) => reason);

		expect(error).toBeInstanceOf(AgentMaxIterationsError);
	});

	it("fails the run when the provider answered nothing at all", async () => {
		const silent = new TurnScriptModel([[ModelChunk.finish("stop")]]);
		const stack = stackOf(silent);

		const error = await stack.runner
			.ask(
				new AgentRunCommand({
					agent: SUPPORT,
					input: AskInput.fromMessage("hi"),
				}),
			)
			.catch((reason) => reason);

		expect(error).toBeInstanceOf(EmptyModelResponseError);
	});

	it("suspends the turn before anything runs when a call has to be answered for", async () => {
		const stack = stackOf(callsThenAnswers(), ToolEffect.WRITE, EffectApprovalPolicy.from(ToolEffect.WRITE));

		const result = await stack.runner.ask(
			new AgentRunCommand({
				agent: SUPPORT,
				input: AskInput.fromMessage("refund order 42"),
			}),
		);

		expect(result.status.equals(AgentRunStatus.SUSPENDED)).toBe(true);
		expect(handler.calls).toBe(0);
		const types = (await stack.readJournal(result.sessionId)).map((event) => event.type);
		expect(types).toContain(ToolApprovalRequested.TYPE);
		expect(types.at(-1)).toBe(AgentRunSuspended.TYPE);
	});

	describe("watching tool calls", () => {
		it("tells the observer what was asked, with the tool and the gate's verdict, then what it answered", async () => {
			const stack = stackOf(callsThenAnswers());
			const observer = new LoggingObserver();

			await stack.runner.ask(
				new AgentRunCommand({
					agent: SUPPORT,
					input: AskInput.fromMessage("where is order 42?"),
					sources: [],
					toolCalls: observer,
				}),
			);

			expect(observer.requests).toHaveLength(1);
			expect(observer.requests[0]?.toolName).toBe("lookup_order");
			expect(observer.requests[0]?.tool?.effect).toBe(ToolEffect.READ);
			expect(observer.requests[0]?.isHeld).toBe(false);
			expect(observer.results).toHaveLength(1);
			expect(observer.results[0]?.callId.value).toBe("c-1");
			expect(observer.results[0]?.output).toEqual({ status: "shipped" });
			expect(observer.results[0]?.failed).toBe(false);
		});

		it("announces the call before the tool runs, and the result after it", async () => {
			const log: string[] = [];
			const observer = new LoggingObserver(log);
			handler = new (class extends CountingHandler {
				public override async invoke(): Promise<unknown> {
					log.push("ran lookup_order");
					return super.invoke();
				}
			})();
			const stack = stackOf(callsThenAnswers());

			await stack.runner.ask(
				new AgentRunCommand({
					agent: SUPPORT,
					input: AskInput.fromMessage("where is order 42?"),
					sources: [],
					toolCalls: observer,
				}),
			);

			expect(log).toEqual(["requested lookup_order", "ran lookup_order", "settled lookup_order"]);
		});

		it("announces a held call as held, and nothing settles because nothing ran", async () => {
			const stack = stackOf(callsThenAnswers(), ToolEffect.WRITE, EffectApprovalPolicy.from(ToolEffect.WRITE));
			const observer = new LoggingObserver();

			const result = await stack.runner.ask(
				new AgentRunCommand({
					agent: SUPPORT,
					input: AskInput.fromMessage("refund order 42"),
					sources: [],
					toolCalls: observer,
				}),
			);

			expect(result.status.equals(AgentRunStatus.SUSPENDED)).toBe(true);
			expect(observer.requests[0]?.isHeld).toBe(true);
			expect(observer.requests[0]?.effect).toBe(ToolEffect.WRITE);
			expect(observer.results).toHaveLength(0);
		});

		it("announces a call to a tool nobody declared as unknown, and its failure as a result", async () => {
			const model = new TurnScriptModel([
				[ModelChunk.toolCall(new ToolCallDelta(0, "{}", "c-9", "made_up")), ModelChunk.finish("tool_calls")],
				[ModelChunk.text("sorry"), ModelChunk.finish("stop")],
			]);
			const stack = stackOf(model);
			const observer = new LoggingObserver();

			await stack.runner.ask(
				new AgentRunCommand({
					agent: SUPPORT,
					input: AskInput.fromMessage("do the thing"),
					sources: [],
					toolCalls: observer,
				}),
			);

			expect(observer.requests[0]?.isKnown).toBe(false);
			expect(observer.results[0]?.failed).toBe(true);
		});

		it("ends the run with whatever the observer threw", async () => {
			const stack = stackOf(callsThenAnswers());
			const observer = new (class extends LoggingObserver {
				public override requested(_context: RunContext): void {
					throw new Error("the card could not be drawn");
				}
			})();

			await expect(
				stack.runner.ask(
					new AgentRunCommand({
						agent: SUPPORT,
						input: AskInput.fromMessage("where is order 42?"),
						sources: [],
						toolCalls: observer,
					}),
				),
			).rejects.toThrow("the card could not be drawn");
			expect(handler.calls).toBe(0);
		});
	});

	it("carries the call the human has to answer for into the suspension", async () => {
		const stack = stackOf(callsThenAnswers(), ToolEffect.WRITE, EffectApprovalPolicy.from(ToolEffect.WRITE));

		const result = await stack.runner.ask(
			new AgentRunCommand({
				agent: SUPPORT,
				input: AskInput.fromMessage("refund order 42"),
			}),
		);

		const suspended = (await stack.readJournal(result.sessionId)).find(
			(event): event is AgentRunSuspended => event instanceof AgentRunSuspended,
		);
		expect(suspended?.calls).toHaveLength(1);
		expect(suspended?.calls[0]?.callId.value).toBe(ToolCallId.from("c-1").value);
	});
});
