/**
 * One section of what a model was sent, serialized the same way every time.
 *
 * The three sections are ordered by how still they are: instructions and tool
 * declarations open every call and are what a provider side cache matches on, and the
 * conversation moves with every turn. Comparing two runs is comparing these strings, so
 * the serialization has to be deterministic or the comparison means nothing.
 */
export class ContextSegment {
	public static readonly INSTRUCTIONS = "instructions";
	public static readonly TOOLS = "tools";
	public static readonly CONVERSATION = "conversation";

	public constructor(
		public readonly kind: string,
		public readonly text: string,
	) {}

	public get characters(): number {
		return this.text.length;
	}
}
