import { AdkError } from "../../../common/errors/adk.error";

/**
 * The stored content does not hash to what the reference claims it should, so the read stops
 * rather than feeding the model content it never produced under an identity it trusts.
 */
export class TamperedArtifactReferenceError extends AdkError {
	public readonly code = "ARTIFACT_REFERENCE_TAMPERED";

	public constructor(
		public readonly artifactId: string,
		public readonly expected: string,
		public readonly found: string,
	) {
		super(`Artifact ${artifactId} does not match its reference: expected ${expected}, found ${found}.`);
	}
}
