import type { ContextWindow } from "../../domain/model/descriptor/context-window";
import { ModelCapabilities } from "../../domain/model/descriptor/model-capabilities";
import { ModelContextWindow } from "../../domain/model/descriptor/model-context-window";
import { ModelDescriptor } from "../../domain/model/descriptor/model-descriptor";
import { ModelIdentity } from "../../domain/model/descriptor/model-identity";
import { LlmModel } from "../../domain/model/llm-model";
import type { ModelRequest } from "../../domain/model/model-request";
import { ModelChunk } from "../../domain/model/streaming/model-chunk";

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
