import { describe, expect, it } from "vitest";
import { ModelChunk } from "../../domain/model/model-chunk";
import { ChunkSink } from "./chunk-sink";

describe("ChunkSink", () => {
	it("is the one thing a run needs to be watchable", () => {
		class Collecting extends ChunkSink {
			public readonly seen: ModelChunk[] = [];

			public emit(chunk: ModelChunk): void {
				this.seen.push(chunk);
			}
		}
		const sink = new Collecting();

		sink.emit(ModelChunk.text("hi"));

		expect(sink.seen).toHaveLength(1);
		expect(sink).toBeInstanceOf(ChunkSink);
	});
});
