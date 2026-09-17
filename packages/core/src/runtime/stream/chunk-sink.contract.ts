import type { ModelChunk } from "../../domain/model/streaming/model-chunk.value-object";

export abstract class ChunkSink {
	public abstract emit(chunk: ModelChunk): void;
}
