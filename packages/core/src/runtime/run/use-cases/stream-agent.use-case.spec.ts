import { describe, expect, it } from "vitest";
import { ModelChunk } from "../../../domain/model/streaming/model-chunk.value-object";
import { ModelUsage } from "../../../domain/model/usage/model-usage.value-object";
import { AskInput } from "../../../domain/session/input/ask-input.command";
import { NativeStackFixture } from "../../../support/run/native-stack.fixture";
import { ScriptedModel } from "../../../support/run/scripted-model.fixture";
import { AgentRunCommand } from "../agent-run.command";

function stackOf(): NativeStackFixture {
	return new NativeStackFixture(
		new ScriptedModel("primary", [
			ModelChunk.text("hel"),
			ModelChunk.text("lo"),
			ModelChunk.usage(ModelUsage.fromReport(10, 2)),
			ModelChunk.finish("stop"),
		]),
	);
}

describe("StreamAgentUseCase", () => {
	it("yields the pieces and returns the same answer ask would have returned", async () => {
		const stack = stackOf();
		const turn = stack.runner.stream(new AgentRunCommand(NativeStackFixture.AGENT, AskInput.fromMessage("hi")));

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
		const turn = stack.runner.stream(new AgentRunCommand(NativeStackFixture.AGENT, AskInput.fromMessage("hi")));

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

		const turn = streamed.runner.stream(new AgentRunCommand(NativeStackFixture.AGENT, AskInput.fromMessage("hi")));
		let step = await turn.next();
		while (step.done !== true) step = await turn.next();
		const result = await asked.runner.ask(new AgentRunCommand(NativeStackFixture.AGENT, AskInput.fromMessage("hi")));

		const streamedTypes = (await streamed.readJournal(step.value.sessionId)).map((event) => event.type);
		const askedTypes = (await asked.readJournal(result.sessionId)).map((event) => event.type);
		expect(streamedTypes).toEqual(askedTypes);
	});
});
