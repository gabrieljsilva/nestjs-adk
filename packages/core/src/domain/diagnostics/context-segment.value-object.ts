/**
 * One section of what a model was sent, serialized deterministically so that two runs can be
 * compared by comparing these strings.
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
