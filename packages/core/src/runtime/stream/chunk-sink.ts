import type { ModelChunk } from "../../domain/model/model-chunk";

/**
 * Where a run sends the pieces of an answer while it is still producing them.
 *
 * A chunk is a runtime event and never a durable one: it does not advance the session
 * revision, is not journaled and is not replayed. What survives a restart is the answer
 * the turn was aggregated into, which is why a run with no sink behaves identically to
 * one with a sink nobody read.
 */
export abstract class ChunkSink {
	public abstract emit(chunk: ModelChunk): void;
}
