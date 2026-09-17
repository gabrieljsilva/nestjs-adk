import type { AttachmentResolver } from "../../contracts/context/attachment-resolver.contract";
import type { CompactionStrategy } from "../../contracts/context/compaction-strategy.contract";
import type { ContextNoticeSink } from "../../contracts/context/context-notice-sink.contract";
import type { ContextSummarizer } from "../../contracts/context/context-summarizer.contract";
import type { ConsumerNoticeSink } from "../../contracts/events/consumer-notice-sink.contract";
import type { SessionEventConsumer } from "../../contracts/events/session-event-consumer.contract";
import type { ModelResolver } from "../../contracts/model/model-resolver.contract";
import type { PricingNoticeSink } from "../../contracts/pricing/pricing-notice-sink.contract";
import type { PricingSource } from "../../contracts/pricing/pricing-source.contract";
import type { ToolSource } from "../../contracts/tool/tool-source.contract";
import { CharacterCountOffloadPolicy } from "../../domain/artifact/character-count-offload.policy";
import type { OffloadPolicy } from "../../domain/artifact/offload.policy";
import type { AdkCompactionPolicy } from "../../domain/context/adk-compaction.policy";
import { RunLimits } from "../../domain/session/run/run-limits.value-object";
import type { AdkAccessPolicy } from "../../domain/tool/access/adk-access.policy";
import { OpenAccessPolicy } from "../../domain/tool/access/open-access.policy";
import type { AdkApprovalPolicy } from "../../domain/tool/approval/adk-approval.policy";
import { EffectApprovalPolicy } from "../../domain/tool/approval/effect-approval.policy";
import type { EventRedactor } from "../event/event-redactor.contract";
import { FieldNameEventRedactor } from "../event/field-name-event-redactor.adapter";
import { ShutdownOptions } from "../lifecycle/shutdown.options";
import { RevisionBucketSnapshotPolicy } from "../session/snapshot/revision-bucket-snapshot.policy";
import type { SnapshotPolicy } from "../session/snapshot/snapshot.policy";

/**
 * The fields a caller may name; one left out keeps whatever the options already hold.
 * There is no way to clear a field through a patch: replacing is naming, clearing is
 * building fresh options.
 */
export interface RuntimeOptionsPatch {
	shutdown?: ShutdownOptions;
	limits?: RunLimits;
	consumers?: readonly SessionEventConsumer[];
	offload?: OffloadPolicy;
	approvals?: AdkApprovalPolicy;
	sources?: readonly ToolSource[];
	snapshots?: SnapshotPolicy;
	models?: ModelResolver;
	summarizer?: ContextSummarizer;
	contextNotices?: ContextNoticeSink;
	consumerNotices?: ConsumerNoticeSink;
	compaction?: AdkCompactionPolicy | false;
	/** How a context that grew too long becomes one that fits. Absent keeps the shipped strategy. */
	compactionStrategy?: CompactionStrategy;
	/** What is masked out of a payload before a consumer reads it. */
	redactor?: EventRedactor;
	pricing?: PricingSource;
	pricingNotices?: PricingNoticeSink;
	attachments?: AttachmentResolver;
	/** Who may call which tool. Consulted on every invocation, by the agent loop and by an MCP server alike. */
	access?: AdkAccessPolicy;
}

/**
 * What the application chose to plug into the runtime, and nothing it must choose.
 *
 * Every port here has a default the runtime can compose without help, so an application
 * that declares none still gets a working runtime. The ones that are absent are absent
 * on purpose: without a summarizer compaction drops instead of summarizing, and without
 * a notice sink an unknown window is simply not reported anywhere.
 */
export class RuntimeOptions {
	public constructor(
		public readonly shutdown: ShutdownOptions = ShutdownOptions.waitIndefinitely(),
		/**
		 * Fifty iterations unless the application says otherwise, and `RunLimits.unbounded()`
		 * is how it says so. An agent, and then a call, may narrow or widen it from here.
		 */
		public readonly limits: RunLimits = RunLimits.byDefault(),
		public readonly consumers: readonly SessionEventConsumer[] = [],
		public readonly offload: OffloadPolicy = CharacterCountOffloadPolicy.byDefault(),
		/**
		 * A tool declared destructive stops in front of a human unless the application says
		 * otherwise, which is the safe half of the trade: the cost of the default being wrong is a
		 * run that waits, and the cost the other way is an effect nobody agreed to.
		 */
		public readonly approvals: AdkApprovalPolicy = EffectApprovalPolicy.destructiveOnly(),
		public readonly sources: readonly ToolSource[] = [],
		public readonly snapshots: SnapshotPolicy = RevisionBucketSnapshotPolicy.everyFiftyEvents(),
		public readonly models?: ModelResolver,
		public readonly summarizer?: ContextSummarizer,
		public readonly contextNotices?: ContextNoticeSink,
		public readonly consumerNotices?: ConsumerNoticeSink,
		/**
		 * What every agent that declared none runs under; one that declared its own keeps it.
		 * Absent means the standard share of the window, and `false` means no conversation
		 * running under this runtime is ever shortened.
		 */
		public readonly compaction?: AdkCompactionPolicy | false,
		/** One source for the whole runtime. Without it every run answers a cost of zero and says so. */
		public readonly pricing?: PricingSource,
		public readonly pricingNotices?: PricingNoticeSink,
		/** What an attachment becomes on each projection. Without it, stored bytes inline and links pass through. */
		public readonly attachments?: AttachmentResolver,
		public readonly access: AdkAccessPolicy = new OpenAccessPolicy(),
		/**
		 * Absent means the shipped strategy, which drops the oldest answered exchanges. It is
		 * absent rather than built here because the shipped one needs the measurer and the
		 * summarizer the runtime composes.
		 */
		public readonly compactionStrategy?: CompactionStrategy,
		public readonly redactor: EventRedactor = new FieldNameEventRedactor(),
	) {}

	/** Options built from names instead of positions, with the same defaults as declaring none. */
	public static from(patch: RuntimeOptionsPatch): RuntimeOptions {
		return new RuntimeOptions().with(patch);
	}

	/**
	 * A copy with the named fields replaced and every other field kept.
	 *
	 * This is how three fields change without the other nine being restated: a caller that
	 * copies positions breaks silently whenever a field is added, a patch never does.
	 */
	public with(patch: RuntimeOptionsPatch): RuntimeOptions {
		return new RuntimeOptions(
			patch.shutdown ?? this.shutdown,
			patch.limits ?? this.limits,
			patch.consumers ?? this.consumers,
			patch.offload ?? this.offload,
			patch.approvals ?? this.approvals,
			patch.sources ?? this.sources,
			patch.snapshots ?? this.snapshots,
			patch.models ?? this.models,
			patch.summarizer ?? this.summarizer,
			patch.contextNotices ?? this.contextNotices,
			patch.consumerNotices ?? this.consumerNotices,
			patch.compaction ?? this.compaction,
			patch.pricing ?? this.pricing,
			patch.pricingNotices ?? this.pricingNotices,
			patch.attachments ?? this.attachments,
			patch.access ?? this.access,
			patch.compactionStrategy ?? this.compactionStrategy,
			patch.redactor ?? this.redactor,
		);
	}
}
