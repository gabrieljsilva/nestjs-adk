import { describe, expect, it } from "vitest";
import { ModelChunk } from "../../domain/model/model-chunk";
import { ModelUsage } from "../../domain/model/model-usage";
import { AskInput } from "../../domain/session/ask-input";
import { NativeStackFixture } from "../../support/run/native-stack.fixture";
import { ScriptedModel } from "../../support/run/scripted-model.fixture";
import { AgentRunCommand } from "./agent-run-command";

function stackOf(): NativeStackFixture {
	return new NativeStackFixture(
		new ScriptedModel("primary", [
			ModelChunk.text("hel"),
			ModelChunk.text("lo"),
			ModelChunk.usage(ModelUsage.of(10, 2)),
			ModelChunk.finish("stop"),
		]),
	);
}

describe("StreamAgent", () => {
	it("yields the pieces and returns the same answer ask would have returned", async () => {
		const stack = stackOf();
		const turn = stack.runner.stream(new AgentRunCommand(NativeStackFixture.AGENT, AskInput.of("hi")));

		const chunks: ModelChunk[] = [];
		let step = await turn.next();
		while (step.done !== true) {
			chunks.push(step.value);
			step = await turn.next();
		}

		expect(chunks.map((chunk) => chunk.textDelta).join("")).toBe("hello");
		expect(step.value.text).toBe("hello");
	});

	it("hands the run's own failure to whoever was watching", async () => {
		const stack = new NativeStackFixture(new ScriptedModel("primary", [], true));
		const turn = stack.runner.stream(new AgentRunCommand(NativeStackFixture.AGENT, AskInput.of("hi")));

		await expect(
			(async () => {
				let step = await turn.next();
				while (step.done !== true) step = await turn.next();
				return step.value;
			})(),
		).rejects.toThrow();
	});

	it("writes the same journal a plain ask writes, because a chunk is not an event", async () => {
		const streamed = stackOf();
		const asked = stackOf();

		const turn = streamed.runner.stream(new AgentRunCommand(NativeStackFixture.AGENT, AskInput.of("hi")));
		let step = await turn.next();
		while (step.done !== true) step = await turn.next();
		const result = await asked.runner.ask(new AgentRunCommand(NativeStackFixture.AGENT, AskInput.of("hi")));

		const streamedTypes = (await streamed.journalOf(step.value.sessionId)).map((event) => event.type);
		const askedTypes = (await asked.journalOf(result.sessionId)).map((event) => event.type);
		expect(streamedTypes).toEqual(askedTypes);
	});
});
