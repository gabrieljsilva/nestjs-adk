/**
 * How a store keeps an artifact's content: as the text itself, or as base64 standing for bytes.
 * It is written beside the content, because a reader cannot tell the two apart by looking.
 */
export class ArtifactEncoding {
	public static readonly TEXT = new ArtifactEncoding("utf-8");
	public static readonly BASE64 = new ArtifactEncoding("base64");

	private constructor(public readonly name: string) {}

	public static fromName(name: string): ArtifactEncoding | undefined {
		return [ArtifactEncoding.TEXT, ArtifactEncoding.BASE64].find((encoding) => encoding.name === name);
	}

	public get isText(): boolean {
		return this === ArtifactEncoding.TEXT;
	}

	public equals(other: ArtifactEncoding): boolean {
		return this.name === other.name;
	}

	public toString(): string {
		return this.name;
	}
}
