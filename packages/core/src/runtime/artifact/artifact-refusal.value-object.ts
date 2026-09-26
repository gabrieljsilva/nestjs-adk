import type { ArtifactReference } from "../../domain/artifact/artifact-reference.value-object";

export class ArtifactRefusal {
	private constructor(
		private readonly reference: ArtifactReference,
		private readonly reason: string,
	) {}

	public static forBytes(reference: ArtifactReference): ArtifactRefusal {
		return new ArtifactRefusal(
			reference,
			`artifact ${reference.id.value} is ${reference.mediaType}, ${reference.bytes} bytes, and no tool reads bytes.`,
		);
	}

	public static forSize(reference: ArtifactReference, ceiling: number): ArtifactRefusal {
		return new ArtifactRefusal(
			reference,
			`artifact ${reference.id.value} is ${reference.characters} characters and this tool explores up to ${ceiling}; read it by range with read_artifact(offset, limit) instead.`,
		);
	}

	public toResult(): Record<string, unknown> {
		return {
			artifactId: this.reference.id.value,
			mediaType: this.reference.mediaType,
			refused: true,
			reason: this.reason,
		};
	}
}
