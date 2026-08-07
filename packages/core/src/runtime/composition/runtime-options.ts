import type { ConsumerNoticeSink } from "../../contracts/consumer-notice-sink";
import type { ContextNoticeSink } from "../../contracts/context-notice-sink";
import type { ContextSummarizer } from "../../contracts/context-summarizer";
import type { ModelResolver } from "../../contracts/model-resolver";
import type { PricingNoticeSink } from "../../contracts/pricing-notice-sink";
import type { PricingSource } from "../../contracts/pricing-source";
import type { SessionEventConsumer } from "../../contracts/session-event-consumer";
import type { ToolSource } from "../../contracts/tool-source";
import { OffloadPolicy } from "../../domain/artifact/offload-policy";
import type { AdkCompactionPolicy } from "../../domain/context/adk-compaction-policy";
import { RunLimits } from "../../domain/session/run-limits";
import type { AdkApprovalPolicy } from "../../domain/tool/adk-approval-policy";
import { EffectApprovalPolicy } from "../../domain/tool/effect-approval-policy";
import { ShutdownOptions } from "../lifecycle/shutdown-options";
import { SnapshotPolicy } from "../session/snapshot/snapshot-policy";

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
	compaction?: AdkCompactionPolicy;
	pricing?: PricingSource;
	pricingNotices?: PricingNoticeSink;
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
		public readonly limits: RunLimits = RunLimits.none(),
		public readonly consumers: readonly SessionEventConsumer[] = [],
		public readonly offload: OffloadPolicy = OffloadPolicy.byDefault(),
		public readonly approvals: AdkApprovalPolicy = EffectApprovalPolicy.never(),
		public readonly sources: readonly ToolSource[] = [],
		public readonly snapshots: SnapshotPolicy = SnapshotPolicy.everyFiftyEvents(),
		public readonly models?: ModelResolver,
		public readonly summarizer?: ContextSummarizer,
		public readonly contextNotices?: ContextNoticeSink,
		public readonly consumerNotices?: ConsumerNoticeSink,
		/** What every agent that declared none runs under; one that declared its own keeps it. */
		public readonly compaction?: AdkCompactionPolicy,
		/** One source for the whole runtime. Without it every run answers a cost of zero and says so. */
		public readonly pricing?: PricingSource,
		public readonly pricingNotices?: PricingNoticeSink,
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
		);
	}
}
