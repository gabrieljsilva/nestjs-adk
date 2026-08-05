/** Single exported class, no foreign imports, no escape hatches. */
export class CleanConcept {
	private constructor(public readonly label: string) {}

	public static of(label: string): CleanConcept {
		return new CleanConcept(label);
	}

	public equals(other: CleanConcept): boolean {
		return this.label === other.label;
	}
}
