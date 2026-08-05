/** One queued answer: either words, or a request for one tool. */
export class ScriptedTurn {
	private constructor(
		public readonly text: string,
		public readonly call?: { tool: string; args: Record<string, unknown> },
	) {}

	public static text(text: string): ScriptedTurn {
		return new ScriptedTurn(text);
	}

	public static toolCall(tool: string, args: Record<string, unknown>): ScriptedTurn {
		return new ScriptedTurn("", { tool, args });
	}
}
