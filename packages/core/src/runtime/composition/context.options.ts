import type { AttachmentResolver } from "../../contracts/context/attachment-resolver.contract";
import type { CompactionStrategy } from "../../contracts/context/compaction-strategy.contract";
import type { ContextNoticeSink } from "../../contracts/context/context-notice-sink.contract";
import type { ContextSummarizer } from "../../contracts/context/context-summarizer.contract";
import { CharacterCountOffloadPolicy } from "../../domain/artifact/character-count-offload.policy";
import type { OffloadPolicy } from "../../domain/artifact/offload.policy";
import type { AdkCompactionPolicy } from "../../domain/context/adk-compaction.policy";

/** The fields a caller may name; one left out keeps whatever the options already hold. */
export interface ContextOptionsPatch {
	/**
	 * What every agent that declared none runs under; one that declared its own keeps it.
	 * Absent means the standard share of the window, and `false` means no conversation
	 * running under this runtime is ever shortened.
	 */
	compaction?: AdkCompactionPolicy | false;
	/** How a context that grew too long becomes one that fits. Absent keeps the shipped strategy. */
	compactionStrategy?: CompactionStrategy;
	summarizer?: ContextSummarizer;
	/** What an attachment becomes on each projection. Without it, stored bytes inline and links pass through. */
	attachments?: AttachmentResolver;
	offload?: OffloadPolicy;
	contextNotices?: ContextNoticeSink;
}

/**
 * Everything that decides what a model reads: how much of the journal reaches it, what
 * happens when that is too much, and what an attachment becomes on the way.
 *
 * They are one object because they are read together and they constrain each other: a
 * summarizer nobody declared changes what the shipped compaction strategy does, and an
 * offload policy decides which tool results ever reach a window at all.
 */
export class ContextOptions {
	public constructor(
		public readonly offload: OffloadPolicy = CharacterCountOffloadPolicy.byDefault(),
		public readonly compaction?: AdkCompactionPolicy | false,
		/**
		 * Absent means the shipped strategy, which drops the oldest answered exchanges. It is
		 * absent rather than built here because the shipped one needs the measurer and the
		 * summarizer the runtime composes.
		 */
		public readonly compactionStrategy?: CompactionStrategy,
		public readonly summarizer?: ContextSummarizer,
		public readonly attachments?: AttachmentResolver,
		public readonly contextNotices?: ContextNoticeSink,
	) {}

	/** Options built from names instead of positions, with the same defaults as declaring none. */
	public static from(patch: ContextOptionsPatch): ContextOptions {
		return new ContextOptions().with(patch);
	}

	/** A copy with the named fields replaced and every other field kept. */
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
