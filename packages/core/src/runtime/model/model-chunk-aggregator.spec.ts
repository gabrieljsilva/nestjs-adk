import { describe, expect, it } from "vitest";
import { MalformedToolCallError } from "../../domain/model/errors/malformed-tool-call.error";
import { ModelChunk } from "../../domain/model/model-chunk";
import { ModelIdentity } from "../../domain/model/model-identity";
import { ModelUsage } from "../../domain/model/model-usage";
import { ToolCallDelta } from "../../domain/model/tool-call-delta";
import { ModelChunkAggregator } from "./model-chunk-aggregator";

const MODEL = ModelIdentity.of("acme", "m-1");

function aggregate(chunks: ModelChunk[]): ModelChunkAggregator {
	const aggregator = new ModelChunkAggregator();
	for (const chunk of chunks) aggregator.accept(chunk);
	return aggregator;
}

describe("ModelChunkAggregator", () => {
	it("concatenates the text deltas in order", () => {
		const response = aggregate([
			ModelChunk.text("Reem"),
			ModelChunk.text("bolso "),
			ModelChunk.text("concluído"),
		]).toResponse(MODEL);

		expect(response.text).toBe("Reembolso concluído");
	});

	it("answers empty text when the turn was only a tool call", () => {
		const response = aggregate([
			ModelChunk.toolCall(new ToolCallDelta(0, "{}", "call-1", "refund")),
			ModelChunk.finish("tool_calls"),
		]).toResponse(MODEL);

		expect(response.text).toBe("");
		expect(response.hasToolCalls).toBe(true);
	});

	it("assembles a tool call streamed as fragments", () => {
		const response = aggregate([
			ModelChunk.toolCall(new ToolCallDelta(0, "", "call-1", "refund")),
			ModelChunk.toolCall(new ToolCallDelta(0, '{"orderId"')),
			ModelChunk.toolCall(new ToolCallDelta(0, ':"42"}')),
		]).toResponse(MODEL);

		expect(response.toolCalls).toHaveLength(1);
		expect(response.toolCalls[0]?.toolName).toBe("refund");
		expect(response.toolCalls[0]?.callId.value).toBe("call-1");
		expect(response.toolCalls[0]?.args).toEqual({ orderId: "42" });
	});

	it("keeps parallel calls apart, by index, and in index order", () => {
		const response = aggregate([
			ModelChunk.toolCall(new ToolCallDelta(1, "", "call-2", "fetch")),
			ModelChunk.toolCall(new ToolCallDelta(0, "", "call-1", "refund")),
			ModelChunk.toolCall(new ToolCallDelta(1, '{"url":"a"}')),
			ModelChunk.toolCall(new ToolCallDelta(0, '{"orderId":"42"}')),
		]).toResponse(MODEL);

		expect(response.toolCalls.map((call) => call.toolName)).toEqual(["refund", "fetch"]);
	});

	it("names a call the provider gave no id, so a result can still be paired to it", () => {
		const response = aggregate([ModelChunk.toolCall(new ToolCallDelta(0, "{}", undefined, "refund"))]).toResponse(MODEL);

		expect(response.toolCalls[0]?.callId.value).toBe("call-0");
	});

	it("refuses a call whose arguments never became an object", () => {
		const aggregator = aggregate([ModelChunk.toolCall(new ToolCallDelta(0, '{"orderId":', "call-1", "refund"))]);

		expect(() => aggregator.toResponse(MODEL)).toThrow(MalformedToolCallError);
	});

	it("refuses a call the model never named", () => {
		const aggregator = aggregate([ModelChunk.toolCall(new ToolCallDelta(0, "{}", "call-1"))]);

		expect(() => aggregator.toResponse(MODEL)).toThrow(MalformedToolCallError);
	});

	it("keeps the usage the provider reported", () => {
		const response = aggregate([
			ModelChunk.text("hi"),
			ModelChunk.usage(ModelUsage.of(100, 40, 80)),
			ModelChunk.finish("stop"),
		]).toResponse(MODEL);

		expect(response.usage.inputTokens).toBe(100);
		expect(response.usage.cachedInputTokens).toBe(80);
	});

	it("reports no usage when the provider reported none", () => {
		const response = aggregate([ModelChunk.text("hi")]).toResponse(MODEL);

		expect(response.usage.totalTokens).toBe(0);
	});

	it("keeps the reason the turn ended", () => {
		const response = aggregate([ModelChunk.text("hi"), ModelChunk.finish("stop")]).toResponse(MODEL);

		expect(response.finishReason).toBe("stop");
	});

	it("exposes the text as it stands, before the turn ends", () => {
		const aggregator = aggregate([ModelChunk.text("Reem"), ModelChunk.text("bolso")]);

		expect(aggregator.aggregatedText).toBe("Reembolso");
	});

	it("carries a structured output when one was validated", () => {
		const response = aggregate([ModelChunk.text('{"ok":true}')]).toResponse(MODEL, { ok: true });

		expect(response.structuredOutput).toEqual({ ok: true });
	});

	it("reports an empty turn, which is a provider answering badly", () => {
		expect(aggregate([ModelChunk.finish("stop")]).toResponse(MODEL).isEmpty).toBe(true);
	});
});
