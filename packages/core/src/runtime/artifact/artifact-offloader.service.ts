import type { ArtifactStorage } from "../../contracts/storage/artifact-storage.contract";
import { ArtifactContent } from "../../domain/artifact/artifact-content.value-object";
import { CharacterCountOffloadPolicy } from "../../domain/artifact/character-count-offload.policy";
import type { OffloadDecision } from "../../domain/artifact/offload-decision.value-object";
import type { OffloadPolicy } from "../../domain/artifact/offload.policy";
import { OffloadedContent } from "../../domain/artifact/offloaded-content.value-object";
import type { SessionContext } from "../../domain/run/session-context.value-object";

/**
 * Moves a result out of the context when it is too large to belong there.
 *
 * What comes back is always readable by the model: either the text itself or a
 * placeholder that names the artifact, its size and the tools that reach it, which is
 * enough for the model to decide whether it wants the rest and how to ask for it. Nothing is summarized or truncated on the way, so
 * the content the model asks back for is the content the tool produced.
 *
 * A storage that refuses the write is not a failed run. The result goes into the context
 * whole instead, which costs room and keeps the answer, and that is the better trade
 * when the alternative is losing what a tool already did.
 */
export class ArtifactOffloader {
	public constructor(
		private readonly storage: ArtifactStorage,
		private readonly policy: OffloadPolicy = CharacterCountOffloadPolicy.byDefault(),
	) {}

	public async offload(context: SessionContext, text: string, mediaType?: string): Promise<OffloadedContent> {
		const content = new ArtifactContent(text, mediaType);
		const decision = this.policy.decide(content.characters, content.mediaType);
		if (decision.isInline) return OffloadedContent.inline(text);
		try {
			return OffloadedContent.offloaded(await this.storage.put(context, content), decision);
		} catch {
			return OffloadedContent.inline(text);
		}
	}

	/** What a result of this size and shape would become, for a caller budgeting one before it writes it. */
	public decide(characters: number, mediaType?: string): OffloadDecision {
		return this.policy.decide(characters, mediaType);
	}

	/** The room a result has before it stops fitting, which is what the exploration tools answer within. */
	public get thresholdCharacters(): number | undefined {
		return this.policy.thresholdCharacters;
	}
}
