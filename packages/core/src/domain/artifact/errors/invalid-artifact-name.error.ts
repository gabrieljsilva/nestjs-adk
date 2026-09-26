import { AdkError } from "../../../common/errors/adk.error";

/**
 * The name given to an artifact cannot be shown to a model: it is empty, too long, or holds a
 * control character or a square bracket, which would let it forge the placeholder line the
 * model reads.
 */
export class InvalidArtifactNameError extends AdkError {
	public readonly code = "INVALID_ARTIFACT_NAME";

	public constructor(
		public readonly name: string,
		public readonly reason: string,
	) {
		super(`Artifact name ${JSON.stringify(name)} is not usable: ${reason}.`);
	}
}
