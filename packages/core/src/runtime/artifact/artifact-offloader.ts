import type { SessionId } from "../../common/identity/session-id";
import type { ArtifactStorage } from "../../contracts/artifact-storage";
import { ArtifactContent } from "../../domain/artifact/artifact-content";
import { OffloadPolicy } from "../../domain/artifact/offload-policy";
import { OffloadedContent } from "../../domain/artifact/offloaded-content";

/**
 * Moves a result out of the context when it is too large to belong there.
 *
 * What comes back is always readable by the model: either the text itself or a
 * placeholder that names the artifact and its size, which is enough for the model to
 * decide whether it wants the rest. Nothing is summarized or truncated on the way, so
 * the content the model asks back for is the content the tool produced.
 *
 * A storage that refuses the write is not a failed run. The result goes into the context
 * whole instead, which costs room and keeps the answer, and that is the better trade
 * when the alternative is losing what a tool already did.
 */
export class ArtifactOffloader {
	public constructor(
		private readonly storage: ArtifactStorage,
		private readonly policy: OffloadPolicy = OffloadPolicy.byDefault(),
	) {}

	public async offload(sessionId: SessionId, text: string, mediaType?: string): Promise<OffloadedContent> {
		if (!this.policy.shouldOffload(text.length)) return OffloadedContent.inline(text);
		try {
			return OffloadedContent.offloaded(await this.storage.put(sessionId, ArtifactContent.of(text, mediaType)));
		} catch {
			return OffloadedContent.inline(text);
		}
	}
}
