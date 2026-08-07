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

	/**
	 * The one assertion that says "before", and the reason streaming exists at all.
	 *
	 * Every other case here emits and closes together, so a stream that piled every chunk up
	 * and released them on `close` would satisfy all of them: the pieces would arrive as
	 * pieces, just all at once once the turn was over, with a UI showing nothing until then.
	 * Reading a chunk while the run is still open is what tells the two apart, and a stream
	 * that buffered would hang here rather than fail an assertion.
	 */
	it("hands a chunk over while the run is still going, without waiting to be closed", async () => {
		const stream = new ChunkStream();
		const reading = stream.drain();

		stream.emit(ModelChunk.text("early"));
		const first = await reading.next();

		expect(first.done).toBe(false);
		expect(first.value?.textDelta).toBe("early");
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
