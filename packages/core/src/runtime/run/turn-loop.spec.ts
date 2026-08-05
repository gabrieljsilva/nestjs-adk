import { beforeEach, describe, expect, it } from "vitest";
import { ToolCallId } from "../../common/identity/tool-call-id";
import { AgentRunCompleted } from "../../domain/event/catalog/agent-run-completed";
import { AgentRunSuspended } from "../../domain/event/catalog/agent-run-suspended";
import { ToolApprovalRequested } from "../../domain/event/catalog/tool-approval-requested";
import { ToolCallRequested } from "../../domain/event/catalog/tool-call-requested";
import { ToolResultProduced } from "../../domain/event/catalog/tool-result-produced";
import { EmptyModelResponseError } from "../../domain/model/errors/empty-model-response.error";
import { ModelChunk } from "../../domain/model/model-chunk";
import { ToolCallDelta } from "../../domain/model/tool-call-delta";
import { AgentRunStatus } from "../../domain/session/agent-run-status";
import { AskInput } from "../../domain/session/ask-input";
import { AgentMaxIterationsError } from "../../domain/session/errors/agent-max-iterations.error";
import { RunLimits } from "../../domain/session/run-limits";
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

let handler: CountingHandler;

beforeEach(() => {
	handler = new CountingHandler();
});

function stackOf(model: TurnScriptModel, effect = ToolEffect.READ, approvals = EffectApprovalPolicy.never()) {
	return new NativeStackFixture(
		model,
		NativeStackFixture.definitionOf(model, undefined, [toolOf(handler, effect)]),
		approvals,
	);
}

describe("TurnLoop", () => {
	it("calls the tool the model asked for and goes back with the result", async () => {
		const stack = stackOf(callsThenAnswers());

		const result = await stack.runner.ask(new AgentRunCommand(SUPPORT, AskInput.of("where is order 42?")));

		expect(handler.calls).toBe(1);
		expect(result.text).toBe("the order is shipped");
	});

	it("journals what the model asked for before the tool runs, and the result after it", async () => {
		const stack = stackOf(callsThenAnswers());

		const result = await stack.runner.ask(new AgentRunCommand(SUPPORT, AskInput.of("where is order 42?")));

		const types = (await stack.journalOf(result.sessionId)).map((event) => event.type);
		expect(types.indexOf(ToolCallRequested.TYPE)).toBeLessThan(types.indexOf(ToolResultProduced.TYPE));
		expect(types.at(-1)).toBe(AgentRunCompleted.TYPE);
	});

	it("stops at the iteration limit rather than going round on somebody's bill", async () => {
		const forever = new TurnScriptModel([
			[ModelChunk.toolCall(new ToolCallDelta(0, "{}", "c-1", "lookup_order")), ModelChunk.finish("tool_calls")],
		]);
		const stack = stackOf(forever);

		const error = await stack.runner
			.ask(new AgentRunCommand(SUPPORT, AskInput.of("loop please"), RunLimits.of(2)))
			.catch((reason) => reason);

		expect(error).toBeInstanceOf(AgentMaxIterationsError);
	});

	it("fails the run when the provider answered nothing at all", async () => {
		const silent = new TurnScriptModel([[ModelChunk.finish("stop")]]);
		const stack = stackOf(silent);

		const error = await stack.runner.ask(new AgentRunCommand(SUPPORT, AskInput.of("hi"))).catch((reason) => reason);

		expect(error).toBeInstanceOf(EmptyModelResponseError);
	});

	it("suspends the turn before anything runs when a call has to be answered for", async () => {
		const stack = stackOf(callsThenAnswers(), ToolEffect.WRITE, EffectApprovalPolicy.from(ToolEffect.WRITE));

		const result = await stack.runner.ask(new AgentRunCommand(SUPPORT, AskInput.of("refund order 42")));

		expect(result.status.equals(AgentRunStatus.SUSPENDED)).toBe(true);
		expect(handler.calls).toBe(0);
		const types = (await stack.journalOf(result.sessionId)).map((event) => event.type);
		expect(types).toContain(ToolApprovalRequested.TYPE);
		expect(types.at(-1)).toBe(AgentRunSuspended.TYPE);
	});

	it("carries the call the human has to answer for into the suspension", async () => {
		const stack = stackOf(callsThenAnswers(), ToolEffect.WRITE, EffectApprovalPolicy.from(ToolEffect.WRITE));

		const result = await stack.runner.ask(new AgentRunCommand(SUPPORT, AskInput.of("refund order 42")));

		const suspended = (await stack.journalOf(result.sessionId)).find(
			(event): event is AgentRunSuspended => event instanceof AgentRunSuspended,
		);
		expect(suspended?.calls).toHaveLength(1);
		expect(suspended?.calls[0]?.callId.value).toBe(ToolCallId.from("c-1").value);
	});
});
