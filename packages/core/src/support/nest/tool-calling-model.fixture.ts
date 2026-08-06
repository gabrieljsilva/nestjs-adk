import { LlmModel } from "../../domain/model/llm-model";
import { ModelCapabilities } from "../../domain/model/model-capabilities";
import { ModelCapability } from "../../domain/model/model-capability";
import { ModelChunk } from "../../domain/model/model-chunk";
import { ModelContextWindow } from "../../domain/model/model-context-window";
import { ModelDescriptor } from "../../domain/model/model-descriptor";
import { ModelIdentity } from "../../domain/model/model-identity";
import type { ModelRequest } from "../../domain/model/model-request";
import { ModelUsage } from "../../domain/model/model-usage";
import { ToolCallDelta } from "../../domain/model/tool-call-delta";

/**
 * Calls one tool on the first turn, answers on the second, and keeps every request.
 *
 * A model that only answers text cannot tell a wired tool from a broken one. This one
 * makes the call happen and records what came back, which is where the tool's result
 * shows up as either the answer or the error it threw.
 */
export class ToolCallingModel extends LlmModel {
	public readonly requests: ModelRequest[] = [];
	private turns = 0;

	public constructor(
		private readonly tool: string,
		private readonly args: Record<string, unknown> = {},
		private readonly answer: string = "done",
	) {
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
		this.turns += 1;
		if (this.turns === 1) {
			yield ModelChunk.toolCall(new ToolCallDelta(0, JSON.stringify(this.args), "call-1", this.tool));
			yield ModelChunk.usage(ModelUsage.of(50, 5));
			yield ModelChunk.finish("tool_calls");
			return;
		}
		yield ModelChunk.text(this.answer);
		yield ModelChunk.usage(ModelUsage.of(50, 5));
		yield ModelChunk.finish("stop");
	}
}
