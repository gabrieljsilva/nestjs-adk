import { LlmModel, type ModelChunk, type ModelDescriptor, type ModelRequest } from "@nestjs-adk/core";

/**
 * One call to the wrapped model: what it was sent, and every chunk it answered.
 */
export interface RecordedModelCall {
	readonly request: ModelRequest;
	readonly chunks: readonly ModelChunk[];
}

/**
 * Wraps a real model and keeps every request and every chunk, which is how a paid run is read
 * afterwards. It changes nothing about what the wrapped model does.
 */
export class RecordingModel extends LlmModel {
	private readonly recorded: RecordedModelCall[] = [];

	public constructor(private readonly model: LlmModel) {
		super();
	}

	public descriptor(): ModelDescriptor {
		return this.model.descriptor();
	}

	public get calls(): readonly RecordedModelCall[] {
		return this.recorded;
	}

	public get callCount(): number {
		return this.recorded.length;
	}

	public async *generate(request: ModelRequest, signal?: AbortSignal): AsyncIterable<ModelChunk> {
		const chunks: ModelChunk[] = [];
		this.recorded.push({ request, chunks });
		for await (const chunk of this.model.generate(request, signal)) {
			chunks.push(chunk);
			yield chunk;
		}
	}

	public toJSON(): unknown {
		return {
			model: this.model.descriptor().identity.toString(),
			calls: this.recorded.map((call) => ({ request: call.request, chunks: call.chunks })),
		};
	}
}
