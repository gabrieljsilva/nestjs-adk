import type { ContextWindow } from "../../domain/model/context-window";
import { LlmModel } from "../../domain/model/llm-model";
import { ModelCapabilities } from "../../domain/model/model-capabilities";
import { ModelChunk } from "../../domain/model/model-chunk";
import { ModelContextWindow } from "../../domain/model/model-context-window";
import { ModelDescriptor } from "../../domain/model/model-descriptor";
import { ModelIdentity } from "../../domain/model/model-identity";
import type { ModelRequest } from "../../domain/model/model-request";

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
