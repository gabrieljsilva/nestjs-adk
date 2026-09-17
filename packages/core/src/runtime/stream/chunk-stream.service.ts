import type { ModelChunk } from "../../domain/model/streaming/model-chunk.value-object";
import { ChunkSink } from "./chunk-sink.contract";

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
