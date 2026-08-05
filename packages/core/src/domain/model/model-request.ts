import type { PromptInstructions } from "../prompt/prompt-instructions";
import type { ModelMessage } from "./model-message";
import type { ToolDeclaration } from "./tool-declaration";

/** Everything a model needs for one turn, already composed by the runtime. */
export class ModelRequest {
	public constructor(
		public readonly messages: readonly ModelMessage[],
		public readonly tools: readonly ToolDeclaration[] = [],
		public readonly instructions?: PromptInstructions,
		/** Shape the answer must take, when the caller wants data instead of prose. */
		public readonly outputSchema?: unknown,
	) {}

	public get wantsStructuredOutput(): boolean {
		return this.outputSchema !== undefined;
	}

	public get hasTools(): boolean {
		return this.tools.length > 0;
	}
}
