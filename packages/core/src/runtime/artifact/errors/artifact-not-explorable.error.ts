import { AdkError } from "../../../common/errors/adk.error";

/**
 * A question was asked of an artifact in a language its content is not written in.
 *
 * A JSON Pointer means nothing over a log file, and neither does the outline of an object
 * over an image. The tool refuses instead of guessing, because the guess would be an answer
 * about a document that does not exist, and the model would carry it forward as a fact.
 *
 * The message names the other way in, so the model's next call is the one that works rather
 * than the same one again.
 */
export class ArtifactNotExplorableError extends AdkError {
	public readonly code = "ARTIFACT_NOT_EXPLORABLE";

	public constructor(
		public readonly artifactId: string,
		public readonly mediaType: string,
		public readonly expected: string,
	) {
		super(
			`Artifact ${artifactId} is ${mediaType} and this call needs ${expected}. Read it with read_artifact, or search it with search_artifact.`,
		);
	}
}
