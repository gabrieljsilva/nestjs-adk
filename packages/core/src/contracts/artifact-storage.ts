import type { ArtifactId } from "../common/identity/artifact-id";
import type { SessionId } from "../common/identity/session-id";
import type { ArtifactContent } from "../domain/artifact/artifact-content";
import type { ArtifactReference } from "../domain/artifact/artifact-reference";

/**
 * Where content that left the context is kept.
 *
 * Two guarantees define a correct adapter. What comes back out of `read` is byte for
 * byte what went into `put`, verified against the digest the reference carries; and a
 * session only ever reads its own, with anything else answered as absent rather than as
 * refused, because an id is guessable and a refusal confirms it exists.
 *
 * Nothing here is transactional with the journal. An artifact written for a run that
 * then failed is garbage, not corruption, and collecting it is the adapter's business.
 */
export abstract class ArtifactStorage {
	public abstract put(sessionId: SessionId, content: ArtifactContent): Promise<ArtifactReference>;

	public abstract read(sessionId: SessionId, reference: ArtifactReference): Promise<ArtifactContent>;

	/**
	 * The reference behind an id, or nothing when this session has no such artifact.
	 *
	 * It exists because a model only ever knows an id: the placeholder it read names one,
	 * and the digest is bookkeeping it was never shown. Resolution stays scoped to the
	 * session, so knowing an id is not enough to read one.
	 */
	public abstract find(sessionId: SessionId, artifactId: ArtifactId): Promise<ArtifactReference | undefined>;

	/** Removes everything a session owns; a session that owns nothing is not an error. */
	public abstract deleteAll(sessionId: SessionId): Promise<void>;
}
