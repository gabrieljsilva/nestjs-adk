import { ModelMessage } from "./model-message";

/** What the user sent, verbatim. */
export class UserMessage extends ModelMessage {
	public readonly role = "user";

	public constructor(public readonly text: string) {
		super();
	}
}
