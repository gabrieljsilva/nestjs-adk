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

	/** Removes everything a session owns; a session that owns nothing is not an error. */
	public abstract deleteAll(context: SessionContext): Promise<void>;
}
