import { ArtifactId } from "../../common/identity/artifact-id.value-object";
import type { ArtifactStorage } from "../../contracts/storage/artifact-storage.contract";
import type { ArtifactContent } from "../../domain/artifact/artifact-content.value-object";
import type { ArtifactReference } from "../../domain/artifact/artifact-reference.value-object";
import { ArtifactNotFoundError } from "../../domain/artifact/errors/artifact-not-found.error";
import type { SessionContext } from "../../domain/run/session-context.value-object";
import { ArtifactNotExplorableError } from "./errors/artifact-not-explorable.error";

/** An artifact and the reference it was resolved through, which is what names its media type. */
export class LoadedArtifact {
	public constructor(
		public readonly reference: ArtifactReference,
		public readonly content: ArtifactContent,
	) {}

	/**
	 * The artifact as a JSON document, or a refusal naming what it actually is.
	 *
	 * Parsing decides it rather than the media type, because the media type is whatever the
	 * tool that produced the result declared, and the offloader defaults it to `text/plain`
	 * for everything that declared nothing. A log file that happens to be called JSON still
	 * is not one, and a JSON document stored as text still is.
	 */
	public readJsonOrFail(): unknown {
		try {
			return JSON.parse(this.content.text);
		} catch {
			throw new ArtifactNotExplorableError(this.reference.id.value, this.reference.mediaType, "JSON");
		}
	}
}

/**
 * The two steps every tool that reads an artifact takes, written once.
 *
 * Resolving the id inside the session that asked is the whole of the access rule: a model
 * only ever knows an id, and an id from another conversation misses rather than refuses,
 * because a refusal confirms the artifact exists. Reading through the reference is what
 * makes the digest check happen, so a store that lost content under an id it kept is caught
 * here rather than described to a model as fact.
 *
 * Four tools do this, and four copies of it is four chances for one of them to resolve an
 * id without a session.
 */
export class ArtifactLoader {
	public constructor(private readonly storage: ArtifactStorage) {}

	public async loadOrFail(context: SessionContext, artifactId: string): Promise<LoadedArtifact> {
		const id = ArtifactId.from(artifactId);
		const reference = await this.storage.find(context, id);
		if (reference === undefined) throw new ArtifactNotFoundError(id.value, context.sessionId.value);
		return new LoadedArtifact(reference, await this.storage.read(context, reference));
	}
}
