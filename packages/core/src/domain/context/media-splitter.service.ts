import type { ModelMessage } from "../model/messages/model-message.value-object";
import { ToolResultMessage } from "../model/messages/tool-result-message.value-object";
import { UserMessage } from "../model/messages/user-message.value-object";

function fromReference(toolName: string): string {
	return `Image returned by the ${toolName} tool.`;
}

// A tool role carries text only in Chat Completions and Gemini's function response is JSON.
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
			split.push(new UserMessage(fromReference(message.toolName), message.media));
		}
		return split;
	}
}
