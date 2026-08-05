import {
	LlmModel,
	ModelCapabilities,
	ModelCapability,
	ModelChunk,
	ModelContextWindow,
	ModelDescriptor,
	ModelIdentity,
	type ModelRequest,
	ModelUsage,
	ToolCallDelta,
} from "@nestjs-adk/core";
import { ScriptedTurn } from "./scripted-turn";

/**
 * A model that answers a script instead of thinking.
 *
 * Turns are queued and consumed in order, one per model call, so a test says what the
 * conversation looks like rather than what the runtime should do about it. Once the script
 * runs out it answers a short default, which keeps a run that went one turn further than
 * expected from failing as a timeout instead of as an assertion.
 *
 * Every request it was given is kept. That is usually the real assertion: what the agent
 * offered, what the instructions said, what the conversation had grown to.
 */
export class ScriptedModel extends LlmModel {
	public readonly requests: ModelRequest[] = [];
	private readonly script: ScriptedTurn[] = [];

	public constructor(private readonly name = "scripted") {
		super();
	}

	public descriptor(): ModelDescriptor {
		return new ModelDescriptor(
			ModelIdentity.of("test", this.name),
			ModelContextWindow.of(100_000, 4_000),
			ModelCapabilities.of([
				[ModelCapability.TOOLS, true],
				[ModelCapability.STRUCTURED_OUTPUT, true],
			]),
		);
	}

	/** Queues one answer. The next run's first call takes it, the one after takes the next. */
	public mockText(text: string): this {
		this.script.push(ScriptedTurn.text(text));
		return this;
	}

	/** Queues a turn that asks for one tool, which the runtime then actually runs. */
	public mockToolCall(tool: string, args: Record<string, unknown> = {}): this {
		this.script.push(ScriptedTurn.toolCall(tool, args));
		return this;
	}

	public get pending(): number {
		return this.script.length;
	}

	public async *generate(request: ModelRequest): AsyncIterable<ModelChunk> {
		this.requests.push(request);
		const turn = this.script.shift() ?? ScriptedTurn.text("done");
		for (const chunk of this.chunksOf(turn)) yield chunk;
	}

	private chunksOf(turn: ScriptedTurn): readonly ModelChunk[] {
		if (turn.call !== undefined) {
			return [
				ModelChunk.toolCall(
					new ToolCallDelta(0, JSON.stringify(turn.call.args), `call-${this.requests.length}`, turn.call.tool),
				),
				ModelChunk.usage(ModelUsage.of(10, 2)),
				ModelChunk.finish("tool_calls"),
			];
		}
		return [ModelChunk.text(turn.text), ModelChunk.usage(ModelUsage.of(10, 2)), ModelChunk.finish("stop")];
	}
}
