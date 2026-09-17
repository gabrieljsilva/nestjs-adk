import { ModelMessage } from "./model-message";

/** What the model answered in words. */
export class AssistantMessage extends ModelMessage {
	public readonly role = "assistant";

	public constructor(public readonly text: string) {
		super();
	}
}
