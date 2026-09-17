import type { ModelFailure, ModelRequest } from "@nestjs-adk/core";

/**
 * A tool call a scripted turn asks for, by the tool's name and the arguments to send.
 */
export interface ScriptedCall {
	readonly tool: string;
	readonly args: Record<string, unknown>;
}

/**
 * What a turn demands of the request that plays it: a substring, a pattern, or a predicate over
 * the whole request. A request that fails it raises `ScriptDeviationError` instead of answering.
 */
export type TurnExpectation = string | RegExp | ((request: ModelRequest) => boolean);

/**
 * One queued turn: the text or deltas to answer with, the tool calls to ask for, or the failure
 * to raise, plus the guard that refuses a request which drifted.
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

	public static stream(deltas: readonly string[]): ScriptedTurn {
		return new ScriptedTurn(deltas.join(""), [...deltas], []);
	}

	public static toolCall(tool: string, args: Record<string, unknown>): ScriptedTurn {
		return new ScriptedTurn("", [], [{ tool, args }]);
	}

	public static toolCalls(calls: readonly ScriptedCall[]): ScriptedTurn {
		return new ScriptedTurn("", [], [...calls]);
	}

	public static failure(failure: ModelFailure): ScriptedTurn {
		return new ScriptedTurn("", [], [], failure);
	}

	public expecting(expectation: TurnExpectation): ScriptedTurn {
		return new ScriptedTurn(this.text, this.deltas, this.calls, this.failure, expectation);
	}

	public get call(): ScriptedCall | undefined {
		return this.calls.at(0);
	}

	public get hasExpectation(): boolean {
		return this.expectation !== undefined;
	}

	public accepts(request: ModelRequest): boolean {
		const expectation = this.expectation;
		if (expectation === undefined) return true;
		if (typeof expectation === "function") return expectation(request);
		const text = ScriptedTurn.readText(request);
		return typeof expectation === "string" ? text.includes(expectation) : expectation.test(text);
	}

	public get expectationText(): string {
		const expectation = this.expectation;
		if (expectation === undefined) return "anything";
		if (typeof expectation === "function") return "a request the predicate accepts";
		return typeof expectation === "string"
			? `a request mentioning "${expectation}"`
			: `a request matching ${expectation}`;
	}

	private static readText(request: ModelRequest): string {
		return JSON.stringify({ instructions: request.instructions?.text, messages: request.messages });
	}
}
