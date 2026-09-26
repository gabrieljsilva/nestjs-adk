import type { ArtifactStorage } from "../../contracts/storage/artifact-storage.contract";
import { ArtifactContent } from "../../domain/artifact/artifact-content.value-object";
import { CharacterCountOffloadPolicy } from "../../domain/artifact/character-count-offload.policy";
import type { OffloadDecision } from "../../domain/artifact/offload-decision.value-object";
import type { OffloadPolicy } from "../../domain/artifact/offload.policy";
import { OffloadedContent } from "../../domain/artifact/offloaded-content.value-object";
import type { SessionContext } from "../../domain/run/session-context.value-object";

export class ArtifactOffloader {
	public constructor(
		private readonly storage: ArtifactStorage,
		private readonly policy: OffloadPolicy = CharacterCountOffloadPolicy.byDefault(),
	) {}

	public async offload(context: SessionContext, text: string, mediaType?: string): Promise<OffloadedContent> {
		const content = ArtifactContent.fromText(text, mediaType);
		const decision = this.policy.decide(content.characters, content.mediaType);
		if (decision.isInline) return OffloadedContent.inline(text);
		try {
			return OffloadedContent.offloaded(await this.storage.put(context, content), decision);
		} catch {
			return OffloadedContent.inline(text);
		}
	}

	public decide(characters: number, mediaType?: string): OffloadDecision {
		return this.policy.decide(characters, mediaType);
	}

	public get thresholdCharacters(): number | undefined {
		return this.policy.thresholdCharacters;
	}
}
