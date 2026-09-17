import { ModelCapabilities } from "../../domain/model/descriptor/model-capabilities";
import { ModelCapability } from "../../domain/model/descriptor/model-capability";
import { ModelContextWindow } from "../../domain/model/descriptor/model-context-window";
import { ModelDescriptor } from "../../domain/model/descriptor/model-descriptor";
import { ModelIdentity } from "../../domain/model/descriptor/model-identity";
import { LlmModel } from "../../domain/model/llm-model";
import type { ModelRequest } from "../../domain/model/model-request";
import { ModelChunk } from "../../domain/model/streaming/model-chunk";
import { ModelUsage } from "../../domain/model/usage/model-usage";

/**
 * Answers a fixed sentence and keeps every request it was given.
 * It declares tools and structured output so a suite can assert what an agent offered and what
 * shape it asked for, which is most of what there is to check about wiring.
 */
export class RecordingModel extends LlmModel {
	public readonly requests: ModelRequest[] = [];

	public constructor(private readonly answer: string = "done") {
		super();
	}

	public descriptor(): ModelDescriptor {
		return new ModelDescriptor(
			ModelIdentity.of("acme", "primary"),
			ModelContextWindow.of(100_000, 4000),
			ModelCapabilities.of([
				[ModelCapability.TOOLS, true],
				[ModelCapability.STRUCTURED_OUTPUT, true],
			]),
		);
	}

	public async *generate(request: ModelRequest): AsyncIterable<ModelChunk> {
		this.requests.push(request);
		yield ModelChunk.text(this.answer);
		yield ModelChunk.usage(ModelUsage.of(50, 5));
		yield ModelChunk.finish("stop");
	}
}
