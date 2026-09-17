import {
	AgentResult,
	AgentRunId,
	AgentRunStatus,
	ModelChunk,
	ModelUsage,
	SessionId,
	ToolCallDelta,
} from "@nestjs-adk/core";
import { describe, expect, it } from "vitest";
import { RecordedRun } from "./recorded-run";
import { RunEvents } from "./run-events";
import { StreamedRun } from "./streamed-run";

function streamed(chunks: readonly ModelChunk[], text = ""): StreamedRun {
	const result = new AgentResult(SessionId.from("s-1"), AgentRunId.from("r-1"), AgentRunStatus.COMPLETED, text);
	return new StreamedRun(new RecordedRun(result, RunEvents.of([])), chunks);
}

describe("StreamedRun", () => {
	it("reads the text pieces in the order they arrived", () => {
		const run = streamed([ModelChunk.text("A garantia "), ModelChunk.text("é de 90 dias.")]);

		expect(run.textDeltas).toEqual(["A garantia ", "é de 90 dias."]);
	});

	it("leaves out the chunks that carry no text, which a UI has nothing to paint from", () => {
		const run = streamed([
			ModelChunk.text("olá"),
			ModelChunk.toolCall(new ToolCallDelta(0, "{}", "c-1", "find_order")),
			ModelChunk.usage(ModelUsage.of(10, 2)),
			ModelChunk.finish("stop"),
		]);

		expect(run.textDeltas).toEqual(["olá"]);
	});

	it("calls one piece not streamed, because that is what a provider sends with streaming off", () => {
		expect(streamed([ModelChunk.text("tudo de uma vez")]).wasStreamed).toBe(false);
		expect(streamed([ModelChunk.text("em "), ModelChunk.text("pedaços")]).wasStreamed).toBe(true);
	});

	it("says a turn that answered no text was not streamed", () => {
		expect(streamed([ModelChunk.finish("tool_calls")]).wasStreamed).toBe(false);
	});

	/** Extending rather than wrapping is the point: a matcher written for a run has to keep working. */
	it("is the run it watched, so everything a test reads off a run is still there", () => {
		const run = streamed([ModelChunk.text("olá")], "olá");

		expect(run).toBeInstanceOf(RecordedRun);
		expect(run.text).toBe("olá");
		expect(run.sessionId.value).toBe("s-1");
		expect(run.status.name).toBe("completed");
		expect(run.toolsRun).toEqual([]);
	});
});
