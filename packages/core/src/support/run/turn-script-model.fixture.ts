import { ModelCapabilities } from "../../domain/model/descriptor/model-capabilities";
import { ModelCapability } from "../../domain/model/descriptor/model-capability";
import { ModelContextWindow } from "../../domain/model/descriptor/model-context-window";
import { ModelDescriptor } from "../../domain/model/descriptor/model-descriptor";
import { ModelIdentity } from "../../domain/model/descriptor/model-identity";
import { LlmModel } from "../../domain/model/llm-model";
import { ModelChunk } from "../../domain/model/streaming/model-chunk";

/**
 * Answers a different script on each turn, which is what a loop test needs.
 *
 * A model that always answers the same thing cannot be asked to call a tool and then
 * comment on the result, and that sequence is the loop. The last script repeats once the
 * list runs out, so a test only writes the turns it cares about.
 */
export class TurnScriptModel extends LlmModel {
	public turns = 0;

	public constructor(private readonly scripts: readonly (readonly ModelChunk[])[]) {
		super();
	}

	public descriptor(): ModelDescriptor {
		return new ModelDescriptor(
			ModelIdentity.of("acme", "primary"),
			ModelContextWindow.of(100_000, 4000),
			ModelCapabilities.of([[ModelCapability.TOOLS, true]]),
		);
	}

	public async *generate(): AsyncIterable<ModelChunk> {
		const script = this.scripts[Math.min(this.turns, this.scripts.length - 1)] ?? [];
		this.turns += 1;
		for (const chunk of script) yield chunk;
	}
}
