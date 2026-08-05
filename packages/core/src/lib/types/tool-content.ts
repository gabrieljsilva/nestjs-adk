import type { ModelPart } from "./model-io";

/**
 * A tool result that belongs in the model's context as CONTENT, not as a serialized
 * function response.
 *
 * A function response is JSON: base64 inside it is a string the model reads as characters,
 * never as an image. Wrapping the parts here routes them to the provider's native content
 * channel instead, so the model looks at the attachment with the user's question already in
 * context, which is the whole point, since "what colour is the shirt?" and "how many buttons?"
 * cannot both be answered by a description written before either was asked.
 *
 * The payload never reaches the session history: it is injected into the request being built
 * and discarded with it, so a long conversation full of attachments does not carry every one
 * of them in every later turn.
 */
/**
 * The part kinds that can stand alone as content. `toolCall` and `toolResult` are excluded: they
 * describe a turn of the conversation rather than something to look at, and an engine asked to
 * render one would have nothing to emit but an empty part.
 */
export type ToolContentPart = Extract<ModelPart, { text: string } | { data: unknown }>;

export interface ToolContent {
	__content: ToolContentPart[];
}

/** Marks a tool result as content for the model; see {@link ToolContent}. */
export function toolContent(parts: ToolContentPart[]): ToolContent {
	return { __content: parts };
}

export function isToolContent(value: unknown): value is ToolContent {
	return typeof value === "object" && value !== null && Array.isArray((value as ToolContent).__content);
}
