import type { ModelMessage } from "../model/model-message";
import { ToolResultMessage } from "../model/tool-result-message";
import { UserMessage } from "../model/user-message";

/** What introduces the image, in the message that carries it. */
function noteFor(toolName: string): string {
	return `Image returned by the ${toolName} tool.`;
}

/**
 * Moves an image out of a tool result and into the message right after it.
 *
 * A tool role carries text and nothing else in the Chat Completions format, and Gemini's
 * function response is a JSON value. An image left inside one reaches the model as a very
 * long string of base64, which it reads as text and then describes wrongly, confidently.
 *
 * So the result keeps its data and the image travels as a user message immediately after
 * it, which every provider maps to its own multimodal shape without help. The order is
 * what preserves the meaning: the answer, then what the answer looked like.
 *
 * Nothing about the session is rewritten. The journal keeps the result whole, and this
 * shapes only the list of messages one call is about to be given.
 */
export class MediaSplitter {
	public split(messages: readonly ModelMessage[]): readonly ModelMessage[] {
		if (!messages.some((message) => message instanceof ToolResultMessage && message.hasMedia)) return messages;

		const split: ModelMessage[] = [];
		for (const message of messages) {
			if (!(message instanceof ToolResultMessage) || !message.hasMedia) {
				split.push(message);
				continue;
			}
			split.push(message.withoutMedia());
			split.push(new UserMessage(noteFor(message.toolName), message.media));
		}
		return split;
	}
}
