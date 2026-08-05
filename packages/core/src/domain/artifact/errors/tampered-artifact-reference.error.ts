import { AdkError } from "../../../common/errors/adk.error";

/**
 * The stored content does not hash to what the reference claims it should.
 *
 * A reference travels through a journal, a model prompt and back, and anything on that
 * path could have rewritten it. Following it anyway would feed the model content it
 * never produced under an identity it trusts, so the read stops here.
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
