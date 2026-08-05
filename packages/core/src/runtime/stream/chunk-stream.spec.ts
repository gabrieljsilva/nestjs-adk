import { describe, expect, it } from "vitest";
import { ModelChunk } from "../../domain/model/model-chunk";
import { ChunkStream } from "./chunk-stream";

async function collect(stream: ChunkStream): Promise<ModelChunk[]> {
	const seen: ModelChunk[] = [];
	for await (const chunk of stream.drain()) seen.push(chunk);
	return seen;
}

describe("ChunkStream", () => {
	it("hands over what was emitted before anybody started reading", async () => {
		const stream = new ChunkStream();
		stream.emit(ModelChunk.text("one"));
		stream.emit(ModelChunk.text("two"));
		stream.close();

		expect(await collect(stream)).toHaveLength(2);
	});

	it("waits for a chunk that has not arrived yet, instead of ending", async () => {
		const stream = new ChunkStream();
		const reading = collect(stream);

		setTimeout(() => {
			stream.emit(ModelChunk.text("late"));
			stream.close();
		}, 5);

		expect(await reading).toHaveLength(1);
	});

	it("keeps the order the run emitted in", async () => {
		const stream = new ChunkStream();
		const reading = collect(stream);
		stream.emit(ModelChunk.text("a"));
		stream.emit(ModelChunk.text("b"));
		stream.emit(ModelChunk.text("c"));
		stream.close();

		const seen = await reading;
		expect(seen.map((chunk) => chunk.textDelta)).toEqual(["a", "b", "c"]);
	});

	it("ends the iteration when it is closed, even with nothing to hand over", async () => {
		const stream = new ChunkStream();
		const reading = collect(stream);
		stream.close();

		expect(await reading).toEqual([]);
	});

	it("ignores anything emitted after it was closed", async () => {
		const stream = new ChunkStream();
		stream.close();
		stream.emit(ModelChunk.text("too late"));

		expect(await collect(stream)).toEqual([]);
	});
});
