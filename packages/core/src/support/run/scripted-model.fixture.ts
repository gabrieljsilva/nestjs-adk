import { ModelCallFailedError } from "../../domain/model/errors/model-call-failed.error";
import { LlmModel } from "../../domain/model/llm-model";
import { ModelCapabilities } from "../../domain/model/model-capabilities";
import { ModelChunk } from "../../domain/model/model-chunk";
import { ModelContextWindow } from "../../domain/model/model-context-window";
import { ModelDescriptor } from "../../domain/model/model-descriptor";
import { ModelIdentity } from "../../domain/model/model-identity";
import { RateLimitedFailure } from "../../domain/model/rate-limited-failure";

/** Answers a script, or fails the way an adapter would have classified it. */
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
		return new ModelDescriptor(ModelIdentity.of("acme", this.name), ModelContextWindow.of(1000, 100), this.capabilities);
	}

	public async *generate(): AsyncIterable<ModelChunk> {
		this.calls += 1;
		if (this.failure) throw new ModelCallFailedError(new RateLimitedFailure("slow down"), this.name);
		for (const chunk of this.chunks) yield chunk;
	}
}
