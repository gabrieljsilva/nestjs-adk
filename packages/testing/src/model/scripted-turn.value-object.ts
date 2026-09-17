import type { ModelFailure, ModelRequest } from "@nestjs-adk/core";

/** One tool the turn asks for, exactly as the model would have asked. */
export interface ScriptedCall {
	readonly tool: string;
	readonly args: Record<string, unknown>;
}

/** What a turn may demand of the request that plays it: a text the request must mention, a pattern, or a predicate. */
export type TurnExpectation = string | RegExp | ((request: ModelRequest) => boolean);

/**
 * One queued answer: words, one or more tool calls, or a scripted failure.
 *
 * A turn may also carry an expectation about the request that plays it. The expectation is
 * a guard and not an assertion: a request that does not satisfy it stops the run with a
 * deviation error naming the turn, which is how a conversation that drifted is caught at
 * the turn it drifted instead of at the last assert.
 */
export class ScriptedTurn {
	private constructor(
		public readonly text: string,
		public readonly deltas: readonly string[],
		public readonly calls: readonly ScriptedCall[],
		public readonly failure?: ModelFailure,
		public readonly expectation?: TurnExpectation,
	) {}

	public static text(text: string): ScriptedTurn {
		return new ScriptedTurn(text, [text], []);
	}

	/**
	 * The same answer, delivered in pieces, which is what a provider does when it streams.
	 *
	 * `text` stays the whole answer, because that is what the run ends up with either way:
	 * the pieces only decide how many chunks carry it there. A turn scripted with one piece
	 * is indistinguishable from `text`, which is exactly what a non streaming provider sends.
	 */
	public static stream(deltas: readonly string[]): ScriptedTurn {
		return new ScriptedTurn(deltas.join(""), [...deltas], []);
	}

	public static toolCall(tool: string, args: Record<string, unknown>): ScriptedTurn {
		return new ScriptedTurn("", [], [{ tool, args }]);
	}

	/** Every call in one turn, which is how a model asks for tools in parallel. */
	public static toolCalls(calls: readonly ScriptedCall[]): ScriptedTurn {
		return new ScriptedTurn("", [], [...calls]);
	}

	/** A turn that fails instead of answering, which is what a failover policy decides on. */
	public static failure(failure: ModelFailure): ScriptedTurn {
		return new ScriptedTurn("", [], [], failure);
	}

	/** The same turn, guarded: a request that does not satisfy the expectation stops the run. */
	public expecting(expectation: TurnExpectation): ScriptedTurn {
		return new ScriptedTurn(this.text, this.deltas, this.calls, this.failure, expectation);
	}

	/** The first call, for a caller that scripted a single one. */
	public get call(): ScriptedCall | undefined {
		return this.calls.at(0);
	}

	public get hasExpectation(): boolean {
		return this.expectation !== undefined;
	}

	/** Whether the request satisfies this turn's expectation; a turn without one accepts anything. */
	public accepts(request: ModelRequest): boolean {
		const expectation = this.expectation;
		if (expectation === undefined) return true;
		if (typeof expectation === "function") return expectation(request);
		const text = ScriptedTurn.textOf(request);
		return typeof expectation === "string" ? text.includes(expectation) : expectation.test(text);
	}

	/** What the guard demanded, in the words a deviation error shows. */
	public get expectationText(): string {
		const expectation = this.expectation;
		if (expectation === undefined) return "anything";
		if (typeof expectation === "function") return "a request the predicate accepts";
		return typeof expectation === "string"
			? `a request mentioning "${expectation}"`
			: `a request matching ${expectation}`;
	}

	private static textOf(request: ModelRequest): string {
		return JSON.stringify({ instructions: request.instructions?.text, messages: request.messages });
	}
}
