import type { PromptInstructions } from "../prompt/prompt-instructions.value-object";
import type { ModelMessage } from "./messages/model-message.value-object";
import type { ToolDeclaration } from "./messages/tool-declaration.value-object";
import { UserMessage } from "./messages/user-message.value-object";

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
