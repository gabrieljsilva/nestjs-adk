/**
 * What happens to a result the runtime looked at: keep it, move it out, or move it out and
 * say it can still be walked.
 *
 * The three are ordered by how much the model can still do with the content. `inline` left
 * it where it was. `opaque` moved it out and the only way back is reading it, whole or a
 * page at a time. `explorable` moved it out too, and the shape of what was moved is one the
 * runtime's own tools understand, so the model can outline it, search it or point at one
 * value instead of paying for the whole thing to find a line.
 *
 * It is a decision and not a fact about the bytes: the same JSON is explorable under one
 * policy and opaque under another, which is why the policy answers it rather than the
 * content.
 */
export class OffloadDecision {
	public static readonly INLINE = new OffloadDecision("inline");
	public static readonly OPAQUE = new OffloadDecision("opaque");
	public static readonly EXPLORABLE = new OffloadDecision("explorable");

	private constructor(public readonly name: string) {}

	public static fromName(name: string): OffloadDecision | undefined {
		return [OffloadDecision.INLINE, OffloadDecision.OPAQUE, OffloadDecision.EXPLORABLE].find(
			(decision) => decision.name === name,
		);
	}

	/** True when nothing leaves the context, which is the one case with no artifact behind it. */
	public get isInline(): boolean {
		return this === OffloadDecision.INLINE;
	}

	public get isExplorable(): boolean {
		return this === OffloadDecision.EXPLORABLE;
	}

	public equals(other: OffloadDecision): boolean {
		return this.name === other.name;
	}

	public toString(): string {
		return this.name;
	}
}
