import type { ArtifactId } from "../../common/identity/artifact-id.value-object";
import type { ArtifactContent } from "../../domain/artifact/artifact-content.value-object";
import type { ArtifactReference } from "../../domain/artifact/artifact-reference.value-object";
import type { SessionContext } from "../../domain/run/session-context.value-object";

/**
 * Where content that left the context is kept.
 *
 * What comes back out of `read` is byte for byte what went into `put`, verified against the
 * digest the reference carries, and a session only ever reads its own, with anything else
 * answered as absent rather than refused. Nothing here is transactional with the journal.
 */
export abstract class ArtifactStorage {
	public abstract put(context: SessionContext, content: ArtifactContent): Promise<ArtifactReference>;

	public abstract read(context: SessionContext, reference: ArtifactReference): Promise<ArtifactContent>;

	public abstract find(context: SessionContext, artifactId: ArtifactId): Promise<ArtifactReference | undefined>;

	/**
	 * Replaces what one artifact holds, keeping its id and its place in the session's list.
	 *
	 * `reference` is the one the caller read, and it has to still match what is stored, or this
	 * raises `TamperedArtifactReferenceError` rather than overwriting somebody else's write. What
	 * it answers is the only reference that matches afterwards.
	 */
	public abstract update(
		context: SessionContext,
		reference: ArtifactReference,
		content: ArtifactContent,
	): Promise<ArtifactReference>;

	/** The session's artifacts, newest first, never more than `limit`; a session that owns nothing answers an empty list. */
	public abstract list(context: SessionContext, limit: number): Promise<readonly ArtifactReference[]>;

	/** Removes everything a session owns; a session that owns nothing is not an error. */
	public abstract deleteAll(context: SessionContext): Promise<void>;

	public async readRange(
		context: SessionContext,
		reference: ArtifactReference,
		offset: number,
		length: number,
	): Promise<string> {
		const content = await this.read(context, reference);
		return content.text.slice(offset, offset + length);
	}
}
