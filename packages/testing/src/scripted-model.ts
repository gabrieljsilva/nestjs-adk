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
import { ScriptDeviationError } from "./errors/script-deviation.error";
import { ScriptExhaustedError } from "./errors/script-exhausted.error";
import { ScriptMisuseError } from "./errors/script-misuse.error";
import { ScriptNotConsumedError } from "./errors/script-not-consumed.error";
import { type ScriptedCall, ScriptedTurn, type TurnExpectation } from "./scripted-turn";

/** What a turn reports for the prompt it was sent, until a test says otherwise. */
const DEFAULT_PROMPT_TOKENS = 10;

/**
 * A model that answers a script instead of thinking.
 *
 * Turns are queued and consumed in order, one per model call. A lenient script that runs
 * out answers a short default, which keeps an old suite running; a `strict()` one fails
 * naming itself, because a run that went one turn further than the test said is a finding
 * and not a formality. A turn may guard the request that plays it with `expecting`, and a
 * request that does not satisfy the guard stops the run at the turn it drifted.
 *
 * Every request it was given is kept. That is often the real assertion: what the agent
 * offered, what the instructions said, what the conversation had grown to.
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
			ModelIdentity.of("test", this.name),
			ModelContextWindow.of(100_000, 4_000),
			ModelCapabilities.of([
				[ModelCapability.TOOLS, true],
				[ModelCapability.STRUCTURED_OUTPUT, true],
			]),
		);
	}

	/** From here on, a call past the end of the script fails instead of answering a default. */
	public strict(): this {
		this.failsWhenExhausted = true;
		return this;
	}

	/** Queues one answer. The next run's first call takes it, the one after takes the next. */
	public mockText(text: string): this {
		this.script.push(ScriptedTurn.text(text));
		return this;
	}

	/**
	 * Queues one answer delivered in pieces, the way a provider streams it.
	 *
	 * A turn queued with `mockText` arrives as a single chunk carrying the whole answer, which
	 * is what a provider sends with streaming off. That makes it useless for testing a caller
	 * that consumes `stream`: the caller sees one chunk, the assertion passes, and a caller
	 * that only ever renders the last chunk would pass too. Scripting the pieces is what puts
	 * the incremental delivery under test.
	 *
	 * The run still ends with the pieces joined, so an assertion on the answer does not care
	 * which of the two queued it.
	 */
	public mockStream(deltas: readonly string[]): this {
		if (deltas.length === 0) {
			throw new ScriptMisuseError(this.name, "stream a turn with no pieces; queue at least one, or use mockText");
		}
		this.script.push(ScriptedTurn.stream(deltas));
		return this;
	}

	/** Queues a turn that asks for one tool, which the runtime then actually runs. */
	public mockToolCall(tool: string, args: Record<string, unknown> = {}): this {
		this.script.push(ScriptedTurn.toolCall(tool, args));
		return this;
	}

	/** Queues a turn that asks for several tools at once, the way a model asks in parallel. */
	public mockToolCalls(calls: readonly ScriptedCall[]): this {
		this.script.push(ScriptedTurn.toolCalls(calls));
		return this;
	}

	/**
	 * Queues a turn that fails instead of answering.
	 *
	 * The failure is thrown before any chunk, exactly as an adapter throws a classified
	 * provider error, so a failover policy sees it and decides. This is how a chain of
	 * models becomes testable without a provider going down on cue.
	 */
	public mockFailure(failure: ModelFailure): this {
		this.script.push(ScriptedTurn.failure(failure));
		return this;
	}

	/** Guards the turn queued last: a request that does not satisfy it stops the run there. */
	public expecting(expectation: TurnExpectation): this {
		const last = this.script.pop();
		if (last === undefined) {
			throw new ScriptMisuseError(this.name, "guard a turn that was never queued; queue the turn before expecting");
		}
		this.script.push(last.expecting(expectation));
		return this;
	}

	/**
	 * Says how big the provider found the prompt, from the next turn on.
	 *
	 * A context is only ever measured by the provider that answered it, so a run against a
	 * script has no size unless the script gives it one. This is what makes compaction
	 * reachable in a test: a conversation that says it filled the window, without anybody
	 * having to write enough words to fill one.
	 */
	public reportsPromptTokens(tokens: number): this {
		this.promptTokens = tokens;
		return this;
	}

	public get pending(): number {
		return this.script.length;
	}

	/** Fails when a queued turn was never played, which means the run ended before the script did. */
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
		for (const chunk of this.chunksOf(turn)) yield chunk;
	}

	private nextTurn(): ScriptedTurn {
		const turn = this.script.shift();
		if (turn !== undefined) return turn;
		if (this.failsWhenExhausted) throw new ScriptExhaustedError(this.name, this.requests.length - 1);
		return ScriptedTurn.text("done");
	}

	private chunksOf(turn: ScriptedTurn): readonly ModelChunk[] {
		if (turn.calls.length > 0) {
			return [
				...turn.calls.map((call, index) =>
					ModelChunk.toolCall(
						new ToolCallDelta(index, JSON.stringify(call.args), `call-${this.requests.length}-${index}`, call.tool),
					),
				),
				ModelChunk.usage(ModelUsage.of(this.promptTokens, 2)),
				ModelChunk.finish("tool_calls"),
			];
		}
		return [
			...turn.deltas.map((delta) => ModelChunk.text(delta)),
			ModelChunk.usage(ModelUsage.of(this.promptTokens, 2)),
			ModelChunk.finish("stop"),
		];
	}

	private describe(request: ModelRequest): string {
		const text = JSON.stringify({ instructions: request.instructions?.text, messages: request.messages });
		return text.length > 400 ? `${text.slice(0, 400)}...` : text;
	}
}
