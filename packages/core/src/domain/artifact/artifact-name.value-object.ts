import { InvalidArtifactNameError } from "./errors/invalid-artifact-name.error";

const MAX_LENGTH = 160;
const LAST_CONTROL_CODE = 0x1f;
const DELETE_CODE = 0x7f;
const BRACKETS = /[[\]]/u;

/**
 * What an artifact is called when the model and the person read about it. The value comes
 * from an end user, so it is bounded and may not hold a control character or a square
 * bracket: either one would let a file name forge the placeholder line the model reads.
 * Nothing resolves an artifact by name, so two artifacts may share one.
 */
export class ArtifactName {
	public static readonly MAX_LENGTH = MAX_LENGTH;

	private constructor(public readonly value: string) {}

	public static fromText(value: string): ArtifactName {
		const trimmed = value.trim();
		if (trimmed.length === 0) throw new InvalidArtifactNameError(value, "it is empty");
		if (trimmed.length > MAX_LENGTH) {
			throw new InvalidArtifactNameError(value, `it is longer than ${MAX_LENGTH} characters`);
		}
		if (BRACKETS.test(trimmed) || ArtifactName.holdsControlCharacter(trimmed)) {
			throw new InvalidArtifactNameError(value, "it holds a control character or a square bracket");
		}
		return new ArtifactName(trimmed);
	}

	private static holdsControlCharacter(value: string): boolean {
		for (const character of value) {
			const code = character.codePointAt(0) ?? 0;
			if (code <= LAST_CONTROL_CODE || code === DELETE_CODE) return true;
		}
		return false;
	}

	public equals(other: ArtifactName): boolean {
		return this.value === other.value;
	}

	public toString(): string {
		return this.value;
	}
}
