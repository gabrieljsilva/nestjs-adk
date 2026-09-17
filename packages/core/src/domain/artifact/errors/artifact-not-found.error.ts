import { AdkError } from "../../../common/errors/adk.error";

/**
 * No artifact with this id is readable by this session.
 *
 * It is also the answer when the artifact exists and belongs to another session: an id is
 * guessable, and a distinct "not yours" would confirm that it is real.
 */
export class ArtifactNotFoundError extends AdkError {
	public readonly code = "ARTIFACT_NOT_FOUND";

	public constructor(
		public readonly artifactId: string,
		public readonly sessionId: string,
	) {
		super(`Artifact ${artifactId} was not found for session ${sessionId}.`);
	}
}
