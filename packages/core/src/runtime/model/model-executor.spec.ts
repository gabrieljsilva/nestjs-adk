import { describe, expect, it } from "vitest";
import { InvalidStructuredOutputError } from "../../domain/model/errors/invalid-structured-output.error";
import { UnsupportedCapabilityError } from "../../domain/model/errors/unsupported-capability.error";
import { LlmModel } from "../../domain/model/llm-model";
import { ModelCapabilities } from "../../domain/model/model-capabilities";
import { ModelCapability } from "../../domain/model/model-capability";
import { ModelChunk } from "../../domain/model/model-chunk";
import { ModelContextWindow } from "../../domain/model/model-context-window";
import { ModelDescriptor } from "../../domain/model/model-descriptor";
import { ModelIdentity } from "../../domain/model/model-identity";
import { ModelRequest } from "../../domain/model/model-request";
import { ModelUsage } from "../../domain/model/model-usage";
import { ToolCallDelta } from "../../domain/model/tool-call-delta";
import { ToolDeclaration } from "../../domain/model/tool-declaration";
import { UserMessage } from "../../domain/model/user-message";
import { ModelExecutor } from "./model-executor";

const IDENTITY = ModelIdentity.of("acme", "m-1");
const ALL = ModelCapabilities.of([
	[ModelCapability.TOOLS, true],
	[ModelCapability.STRUCTURED_OUTPUT, true],
]);

/** Answers a script, and records whether it was ever asked to. */
class ScriptedModel extends LlmModel {
	public calls = 0;

	public constructor(
		private readonly chunks: readonly ModelChunk[] = [ModelChunk.finish("stop")],
		private readonly capabilities: ModelCapabilities = ALL,
	) {
		super();
	}

	public descriptor(): ModelDescriptor {
		return new ModelDescriptor(IDENTITY, ModelContextWindow.of(1000, 100), this.capabilities);
	}

	public async *generate(_request: ModelRequest, signal?: AbortSignal): AsyncIterable<ModelChunk> {
		this.calls += 1;
		this.signal = signal;
		for (const chunk of this.chunks) yield chunk;
	}

	public signal?: AbortSignal;
}

const executor = new ModelExecutor();
const request = new ModelRequest([new UserMessage("hi")]);
const withTool = new ModelRequest([new UserMessage("hi")], [new ToolDeclaration("refund", "refunds", {})]);

describe("ModelExecutor", () => {
	it("aggregates text, tool calls and usage into one answer", async () => {
		const model = new ScriptedModel([
			ModelChunk.text("Reem"),
			ModelChunk.text("bolso"),
			ModelChunk.toolCall(new ToolCallDelta(0, '{"orderId":"42"}', "call-1", "refund")),
			ModelChunk.usage(ModelUsage.of(100, 40)),
			ModelChunk.finish("stop"),
		]);

		const response = await executor.execute(model, withTool);

		expect(response.text).toBe("Reembolso");
		expect(response.toolCalls[0]?.args).toEqual({ orderId: "42" });
		expect(response.usage.inputTokens).toBe(100);
		expect(response.finishReason).toBe("stop");
		expect(response.model.toString()).toBe("acme/m-1");
	});

	it("answers with the text of the chunks it streamed, exactly", async () => {
		const chunks = [ModelChunk.text("Reem"), ModelChunk.text("bolso "), ModelChunk.text("concluído")];

		const streamed: string[] = [];
		const turn = executor.stream(new ScriptedModel(chunks), request);
		let step = await turn.next();
		while (step.done !== true) {
			streamed.push(step.value.textDelta);
			step = await turn.next();
		}

		expect(step.value.text).toBe(streamed.join(""));
	});

	it("streams the chunks and answers the same aggregate as execute", async () => {
		const chunks = [ModelChunk.text("a"), ModelChunk.text("b"), ModelChunk.finish("stop")];

		const asked = await executor.execute(new ScriptedModel(chunks), request);
		const turn = executor.stream(new ScriptedModel(chunks), request);
		let step = await turn.next();
		while (step.done !== true) step = await turn.next();

		expect(step.value.text).toBe(asked.text);
	});

	it("refuses tools on a model that never declared them, before calling it", async () => {
		const model = new ScriptedModel([ModelChunk.finish("stop")], ModelCapabilities.none());

		await expect(executor.execute(model, withTool)).rejects.toBeInstanceOf(UnsupportedCapabilityError);
		expect(model.calls).toBe(0);
	});

	it("refuses structured output on a model that never declared it, before calling it", async () => {
		const model = new ScriptedModel([ModelChunk.finish("stop")], ModelCapabilities.none());
		const structured = new ModelRequest([new UserMessage("hi")], [], undefined, { type: "object" });

		await expect(executor.execute(model, structured)).rejects.toBeInstanceOf(UnsupportedCapabilityError);
		expect(model.calls).toBe(0);
	});

	it("names the capability that was missing", async () => {
		const model = new ScriptedModel([ModelChunk.finish("stop")], ModelCapabilities.none());

		const failure = await executor.execute(model, withTool).catch((error) => error);

		expect(failure).toBeInstanceOf(UnsupportedCapabilityError);
		if (!(failure instanceof UnsupportedCapabilityError)) return;
		expect(failure.capability).toBe("tools");
		expect(failure.model).toBe("acme/m-1");
	});

	it("runs a request without tools on a model that declares none", async () => {
		const model = new ScriptedModel([ModelChunk.text("hi")], ModelCapabilities.none());

		expect((await executor.execute(model, request)).text).toBe("hi");
	});

	it("validates a structured answer and carries the value", async () => {
		const model = new ScriptedModel([ModelChunk.text('{"refunded":true}')]);
		const structured = new ModelRequest([new UserMessage("hi")], [], undefined, { type: "object" });

		const response = await executor.execute(model, structured);

		expect(response.structuredOutput).toEqual({ refunded: true });
		expect(response.text).toBe('{"refunded":true}');
	});

	it("refuses an answer that is not the shape the call asked for", async () => {
		const model = new ScriptedModel([ModelChunk.text("I cannot do that")]);
		const structured = new ModelRequest([new UserMessage("hi")], [], undefined, { type: "object" });

		await expect(executor.execute(model, structured)).rejects.toBeInstanceOf(InvalidStructuredOutputError);
	});

	it("carries no structured output when none was asked for", async () => {
		const response = await executor.execute(new ScriptedModel([ModelChunk.text("hi")]), request);

		expect(response.structuredOutput).toBeUndefined();
	});

	it("forwards the abort signal to the model", async () => {
		const model = new ScriptedModel();
		const controller = new AbortController();

		await executor.execute(model, request, controller.signal);

		expect(model.signal).toBe(controller.signal);
	});

	it("executes the model it was given, once, and never picks another", async () => {
		const model = new ScriptedModel([ModelChunk.text("hi")]);

		await executor.execute(model, request);

		expect(model.calls).toBe(1);
	});
});
