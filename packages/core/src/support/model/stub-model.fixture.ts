import type { ContextWindow } from "../../domain/model/descriptor/context-window.value-object";
import { ModelCapabilities } from "../../domain/model/descriptor/model-capabilities.value-object";
import { ModelContextWindow } from "../../domain/model/descriptor/model-context-window.value-object";
import { ModelDescriptor } from "../../domain/model/descriptor/model-descriptor.value-object";
import { ModelIdentity } from "../../domain/model/descriptor/model-identity.value-object";
import { LlmModel } from "../../domain/model/llm-model.contract";
import type { ModelRequest } from "../../domain/model/model-request.value-object";
import { ModelChunk } from "../../domain/model/streaming/model-chunk.value-object";

/**
 * A model that answers a script and nothing else.
 *
 * It does not implement `countTokens`, and that is the point: most providers cannot
 * count before a call, so the default double behaves like the majority and any code
 * that quietly depends on a count fails in a test rather than in production.
 */
export class StubModel extends LlmModel {
	private readonly chunks: readonly ModelChunk[];

	public constructor(
		private readonly window: ContextWindow = ModelContextWindow.of(1000, 100),
		private readonly identity: ModelIdentity = ModelIdentity.of("test", "stub"),
		chunks: readonly ModelChunk[] = [ModelChunk.finish("stop")],
	) {
		super();
		this.chunks = [...chunks];
	}

	public descriptor(): ModelDescriptor {
		return new ModelDescriptor(this.identity, this.window, ModelCapabilities.none());
	}

	public async *generate(_request: ModelRequest): AsyncIterable<ModelChunk> {
		for (const chunk of this.chunks) yield chunk;
	}
}
