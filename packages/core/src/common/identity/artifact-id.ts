import { IdentityText } from "./identity-text";

/** Identity of a piece of content that was moved out of the context. */
export class ArtifactId {
	private readonly text: IdentityText;

	private constructor(text: IdentityText) {
		this.text = text;
	}

	public static from(value: string): ArtifactId {
		return new ArtifactId(IdentityText.of(value, "ArtifactId"));
	}

	public get value(): string {
		return this.text.value;
	}

	public equals(other: ArtifactId): boolean {
		return this.text.equals(other.text);
	}

	public toString(): string {
		return this.text.value;
	}
}
