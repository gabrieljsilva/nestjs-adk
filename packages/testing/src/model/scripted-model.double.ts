import {
	LlmModel,
	ModelCallFailedError,
	ModelCapabilities,
	ModelCapability,
	ModelChunk,
	ModelContextWindow,
	ModelDescriptor,
	type ModelFailure,
	ModelIdentity,
	type ModelRequest,
	ModelUsage,
	ToolCallDelta,
} from "@nestjs-adk/core";
import { ScriptDeviationError } from "../errors/script-deviation.error";
import { ScriptExhaustedError } from "../errors/script-exhausted.error";
import { ScriptMisuseError } from "../errors/script-misuse.error";
import { ScriptNotConsumedError } from "../errors/script-not-consumed.error";
import { type ScriptedCall, ScriptedTurn, type TurnExpectation } from "./scripted-turn.value-object";

const DEFAULT_PROMPT_TOKENS = 10;

/**
 * A model that answers a queue instead of thinking: `mockText`, `mockStream`, `mockToolCall`,
 * `mockToolCalls` and `mockFailure` queue one turn each, and every request it was given is kept.
 *
 * The script is strict. A run asking for a turn nobody queued raises `ScriptExhaustedError`, a
 * request that fails a turn's `expecting` guard raises `ScriptDeviationError`, and turns nobody
 * played are reported by `AdkTestBed.verify` as `ScriptNotConsumedError`.
 */
export class ScriptedModel extends LlmModel {
	public readonly requests: ModelRequest[] = [];
	private readonly script: ScriptedTurn[] = [];
	private promptTokens = DEFAULT_PROMPT_TOKENS;
	private failsWhenExhausted = false;

	public constructor(private readonly name = "scripted") {
		super();
	}

	public descriptor(): ModelDescriptor {
		return new ModelDescriptor(
			new ModelIdentity("test", this.name),
			new ModelContextWindow(100_000, 4_000),
			ModelCapabilities.fromEntries([
				[ModelCapability.TOOLS, true],
				[ModelCapability.STRUCTURED_OUTPUT, true],
			]),
		);
	}

	public strict(): this {
		this.failsWhenExhausted = true;
		return this;
	}

	public mockText(text: string): this {
		this.script.push(ScriptedTurn.text(text));
		return this;
	}

	public mockStream(deltas: readonly string[]): this {
		if (deltas.length === 0) {
			throw new ScriptMisuseError(this.name, "stream a turn with no pieces; queue at least one, or use mockText");
		}
		this.script.push(ScriptedTurn.stream(deltas));
		return this;
	}

	public mockToolCall(tool: string, args: Record<string, unknown> = {}): this {
		this.script.push(ScriptedTurn.toolCall(tool, args));
		return this;
	}

	public mockToolCalls(calls: readonly ScriptedCall[]): this {
		this.script.push(ScriptedTurn.toolCalls(calls));
		return this;
	}

	public mockFailure(failure: ModelFailure): this {
		this.script.push(ScriptedTurn.failure(failure));
		return this;
	}

	public expecting(expectation: TurnExpectation): this {
		const last = this.script.pop();
		if (last === undefined) {
			throw new ScriptMisuseError(this.name, "guard a turn that was never queued; queue the turn before expecting");
		}
		this.script.push(last.expecting(expectation));
		return this;
	}

	public reportsPromptTokens(tokens: number): this {
		this.promptTokens = tokens;
		return this;
	}

	public get pending(): number {
		return this.script.length;
	}

	public verify(): void {
		if (this.script.length > 0) throw new ScriptNotConsumedError(this.name, this.script.length);
	}

	public async *generate(request: ModelRequest): AsyncIterable<ModelChunk> {
		this.requests.push(request);
		const turn = this.nextTurn();
		if (!turn.accepts(request)) {
			throw new ScriptDeviationError(this.name, this.requests.length, turn.expectationText, this.describe(request));
		}
		if (turn.failure !== undefined) throw new ModelCallFailedError(turn.failure, this.name);
		for (const chunk of this.buildChunks(turn)) yield chunk;
	}

	private nextTurn(): ScriptedTurn {
		const turn = this.script.shift();
		if (turn !== undefined) return turn;
		if (this.failsWhenExhausted) throw new ScriptExhaustedError(this.name, this.requests.length - 1);
		return ScriptedTurn.text("done");
	}

	private buildChunks(turn: ScriptedTurn): readonly ModelChunk[] {
		if (turn.calls.length > 0) {
			return [
				...turn.calls.map((call, index) =>
					ModelChunk.toolCall(
						new ToolCallDelta(index, JSON.stringify(call.args), `call-${this.requests.length}-${index}`, call.tool),
					),
				),
				ModelChunk.usage(ModelUsage.fromReport(this.promptTokens, 2)),
				ModelChunk.finish("tool_calls"),
			];
		}
		return [
			...turn.deltas.map((delta) => ModelChunk.text(delta)),
			ModelChunk.usage(ModelUsage.fromReport(this.promptTokens, 2)),
			ModelChunk.finish("stop"),
		];
	}

	private describe(request: ModelRequest): string {
		const text = JSON.stringify({ instructions: request.instructions?.text, messages: request.messages });
		return text.length > 400 ? `${text.slice(0, 400)}...` : text;
	}
}
