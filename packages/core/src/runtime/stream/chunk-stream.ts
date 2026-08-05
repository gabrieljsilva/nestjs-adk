import type { ModelChunk } from "../../domain/model/model-chunk";
import { ChunkSink } from "./chunk-sink";

/**
 * The bridge between a run that pushes chunks and a caller that pulls them.
 *
 * A run has no idea anybody is watching: it emits and carries on. A caller iterating this
 * waits when there is nothing yet and drains what piled up while it was away, so a slow
 * reader never slows the run down and never loses a chunk either.
 *
 * Closing is what ends the iteration. A run that failed closes it too: the failure belongs
 * to whoever awaited the run, and a stream that hung waiting for a chunk that will never
 * arrive would hide it.
 */
export class ChunkStream extends ChunkSink {
	private readonly pending: ModelChunk[] = [];
	private closed = false;
	private wake?: () => void;

	public emit(chunk: ModelChunk): void {
		if (this.closed) return;
		this.pending.push(chunk);
		this.release();
	}

	public close(): void {
		this.closed = true;
		this.release();
	}

	public async *drain(): AsyncGenerator<ModelChunk> {
		for (;;) {
			while (this.pending.length > 0) {
				const chunk = this.pending.shift();
				if (chunk !== undefined) yield chunk;
			}
			if (this.closed) return;
			await new Promise<void>((resolve) => {
				this.wake = resolve;
			});
		}
	}

	private release(): void {
		const wake = this.wake;
		this.wake = undefined;
		wake?.();
	}
}
