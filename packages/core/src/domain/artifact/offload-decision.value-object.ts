/**
 * What happened to a result: `inline` never left the context and has no artifact behind it,
 * `opaque` left and can only be read back, and `explorable` left in a shape the exploration tools
 * understand. It is the policy's decision and not a fact about the bytes.
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
