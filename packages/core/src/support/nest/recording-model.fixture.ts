import { LlmModel } from "../../domain/model/llm-model";
import { ModelCapabilities } from "../../domain/model/model-capabilities";
import { ModelCapability } from "../../domain/model/model-capability";
import { ModelChunk } from "../../domain/model/model-chunk";
import { ModelContextWindow } from "../../domain/model/model-context-window";
import { ModelDescriptor } from "../../domain/model/model-descriptor";
import { ModelIdentity } from "../../domain/model/model-identity";
import type { ModelRequest } from "../../domain/model/model-request";
import { ModelUsage } from "../../domain/model/model-usage";

/**
 * Answers a fixed sentence and keeps every request it was given.
 * It declares tools so a suite can assert what an agent offered, which is most of what
 * there is to check about wiring.
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
			ModelCapabilities.of([[ModelCapability.TOOLS, true]]),
		);
	}

	public async *generate(request: ModelRequest): AsyncIterable<ModelChunk> {
		this.requests.push(request);
		yield ModelChunk.text(this.answer);
		yield ModelChunk.usage(ModelUsage.of(50, 5));
		yield ModelChunk.finish("stop");
	}
}
