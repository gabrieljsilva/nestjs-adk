export type ModelMessageRole = "user" | "assistant" | "tool-call" | "tool-result";

/**
 * One entry of the conversation as the model sees it.
 * A tool call and its result are messages of their own rather than prose inside an
 * assistant turn, so an adapter reads the typed subclass instead of parsing text back.
 */
export abstract class ModelMessage {
	public abstract readonly role: ModelMessageRole;

	public abstract readonly text: string;

	public get characters(): number {
		return this.text.length;
	}
}
