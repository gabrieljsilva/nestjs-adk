import { LlmModel, type ModelChunk, type ModelDescriptor, type ModelRequest } from "@nestjs-adk/core";

/** One model call as it happened: what was sent, and everything that came back. */
export interface RecordedModelCall {
	readonly request: ModelRequest;
	readonly chunks: readonly ModelChunk[];
}

/**
 * Any model, with a copy of everything that went through it.
 *
 * It wraps rather than replaces: the provider underneath answers the run exactly as it
 * would have, and this keeps the traffic. That is what makes a paid suite readable
 * afterwards, and it is also the piece a recorded replay would be built on, since a
 * captured call is a scripted turn somebody already paid for.
 *
 * `toJSON` is the export. What it produces is a plain structure on purpose: it leaves the
 * process, and a test that wants it back feeds it to a script rather than restoring domain
 * objects that were never meant to travel.
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

	/** The traffic as something that can be written to a file and read back. */
	public toJSON(): unknown {
		return {
			model: this.model.descriptor().identity.toString(),
			calls: this.recorded.map((call) => ({ request: call.request, chunks: call.chunks })),
		};
	}
}
