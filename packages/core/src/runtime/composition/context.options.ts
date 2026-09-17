import type { AttachmentResolver } from "../../contracts/context/attachment-resolver.contract";
import type { CompactionStrategy } from "../../contracts/context/compaction-strategy.contract";
import type { ContextNoticeSink } from "../../contracts/context/context-notice-sink.contract";
import type { ContextSummarizer } from "../../contracts/context/context-summarizer.contract";
import { CharacterCountOffloadPolicy } from "../../domain/artifact/character-count-offload.policy";
import type { OffloadPolicy } from "../../domain/artifact/offload.policy";
import type { AdkCompactionPolicy } from "../../domain/context/adk-compaction.policy";

/** The fields a caller may name; one left out keeps whatever the options already hold. */
export interface ContextOptionsPatch {
	compaction?: AdkCompactionPolicy | false;
	compactionStrategy?: CompactionStrategy;
	summarizer?: ContextSummarizer;
	attachments?: AttachmentResolver;
	offload?: OffloadPolicy;
	contextNotices?: ContextNoticeSink;
}

/**
 * What a model reads: how much of the journal reaches it, what happens when that is too
 * much, and what an attachment becomes on the way.
 *
 * Without a summarizer, compaction drops instead of summarizing. `compaction: false` means
 * no conversation under this runtime is ever shortened.
 */
export class ContextOptions {
	public constructor(
		public readonly offload: OffloadPolicy = CharacterCountOffloadPolicy.byDefault(),
		public readonly compaction?: AdkCompactionPolicy | false,
		public readonly compactionStrategy?: CompactionStrategy,
		public readonly summarizer?: ContextSummarizer,
		public readonly attachments?: AttachmentResolver,
		public readonly contextNotices?: ContextNoticeSink,
	) {}

	public static from(patch: ContextOptionsPatch): ContextOptions {
		return new ContextOptions().with(patch);
	}

	public with(patch: ContextOptionsPatch): ContextOptions {
		return new ContextOptions(
			patch.offload ?? this.offload,
			patch.compaction ?? this.compaction,
			patch.compactionStrategy ?? this.compactionStrategy,
			patch.summarizer ?? this.summarizer,
			patch.attachments ?? this.attachments,
			patch.contextNotices ?? this.contextNotices,
		);
	}
}
