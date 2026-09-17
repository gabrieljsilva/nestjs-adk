import { AdkError } from "../../../common/errors/adk.error";

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
