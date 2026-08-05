import type { PromptInstructions } from "../prompt/prompt-instructions";
import type { ModelMessage } from "./model-message";
import type { ToolDeclaration } from "./tool-declaration";
import { UserMessage } from "./user-message";

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

	/** True when any message carries something the model has to look at rather than read. */
	public get hasMedia(): boolean {
		return this.messages.some((message) => message instanceof UserMessage && message.hasMedia);
	}

	public get hasTools(): boolean {
		return this.tools.length > 0;
	}
}
