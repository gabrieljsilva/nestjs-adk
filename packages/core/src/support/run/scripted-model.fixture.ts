import { ModelCapabilities } from "../../domain/model/descriptor/model-capabilities.value-object";
import { ModelContextWindow } from "../../domain/model/descriptor/model-context-window.value-object";
import { ModelDescriptor } from "../../domain/model/descriptor/model-descriptor.value-object";
import { ModelIdentity } from "../../domain/model/descriptor/model-identity.value-object";
import { ModelCallFailedError } from "../../domain/model/errors/model-call-failed.error";
import { RateLimitedFailure } from "../../domain/model/failures/rate-limited-failure.value-object";
import { LlmModel } from "../../domain/model/llm-model.contract";
import { ModelChunk } from "../../domain/model/streaming/model-chunk.value-object";

export class ScriptedModel extends LlmModel {
	public calls = 0;

	public constructor(
		private readonly name: string,
		private readonly chunks: readonly ModelChunk[] = [ModelChunk.text("hello"), ModelChunk.finish("stop")],
		private readonly failure = false,
		private readonly capabilities: ModelCapabilities = ModelCapabilities.none(),
	) {
		super();
	}

	public descriptor(): ModelDescriptor {
		return new ModelDescriptor(
			new ModelIdentity("acme", this.name),
			new ModelContextWindow(1000, 100),
			this.capabilities,
		);
	}

	public async *generate(): AsyncIterable<ModelChunk> {
		this.calls += 1;
		if (this.failure) throw new ModelCallFailedError(new RateLimitedFailure("slow down"), this.name);
		for (const chunk of this.chunks) yield chunk;
	}
}
