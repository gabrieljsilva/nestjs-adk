import { type ModelChunk, ModelRequest, UserMessage } from "@nestjs-adk/core";
import { describe, expect, it } from "vitest";
import { RecordingModel } from "./recording-model";
import { ScriptedModel } from "./scripted-model";

async function drain(model: RecordingModel, request: ModelRequest): Promise<ModelChunk[]> {
	const chunks: ModelChunk[] = [];
	for await (const chunk of model.generate(request)) chunks.push(chunk);
	return chunks;
}

describe("RecordingModel", () => {
	it("answers exactly what the model underneath answered", async () => {
		const recording = new RecordingModel(new ScriptedModel().mockText("resposta"));

		const chunks = await drain(recording, new ModelRequest([new UserMessage("oi")]));

		expect(chunks.map((chunk) => chunk.textDelta).join("")).toBe("resposta");
	});

	it("keeps what was sent and everything that came back", async () => {
		const recording = new RecordingModel(new ScriptedModel().mockText("resposta"));
		const request = new ModelRequest([new UserMessage("oi")]);

		await drain(recording, request);

		expect(recording.callCount).toBe(1);
		expect(recording.calls[0]?.request).toBe(request);
		expect(recording.calls[0]?.chunks.length).toBeGreaterThan(0);
	});

	it("records one entry per call, in order", async () => {
		const recording = new RecordingModel(new ScriptedModel().mockText("primeira").mockText("segunda"));

		await drain(recording, new ModelRequest([new UserMessage("1")]));
		await drain(recording, new ModelRequest([new UserMessage("2")]));

		expect(recording.callCount).toBe(2);
	});

	it("keeps the descriptor of the model it wraps, so nothing about the run changes", () => {
		const wrapped = new ScriptedModel("gpt-ish");

		expect(new RecordingModel(wrapped).descriptor().identity.toString()).toBe(wrapped.descriptor().identity.toString());
	});

	it("exports the traffic as something a file can hold", async () => {
		const recording = new RecordingModel(new ScriptedModel().mockText("resposta"));
		await drain(recording, new ModelRequest([new UserMessage("oi")]));

		const exported = JSON.parse(JSON.stringify(recording));

		expect(exported.calls).toHaveLength(1);
		expect(JSON.stringify(exported)).toContain("resposta");
	});
});
