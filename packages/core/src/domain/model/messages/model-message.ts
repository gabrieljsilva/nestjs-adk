export type ModelMessageRole = "user" | "assistant" | "tool-call" | "tool-result";

/**
 * One entry of the conversation as the model sees it.
 *
 * A tool call and its result are messages of their own instead of prose inside an
 * assistant turn: the context keeps them as the causal pair they are, and a provider
 * adapter reads the typed subclass rather than parsing text back.
 */
export abstract class ModelMessage {
	public abstract readonly role: ModelMessageRole;

	/** The textual form the runtime measures and fingerprints. */
	public abstract readonly text: string;

	/**
	 * How much of the request this message is, in characters.
	 * Text is the usual answer and not the only one: a message carrying an image carries
	 * the encoding of that image too, and a budget that ignored it would be measuring a
	 * request nobody sent.
	 */
	public get characters(): number {
		return this.text.length;
	}
}
