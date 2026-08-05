import type { ConsumerNoticeSink } from "../../contracts/consumer-notice-sink";
import type { ContextNoticeSink } from "../../contracts/context-notice-sink";
import type { ContextSummarizer } from "../../contracts/context-summarizer";
import type { ModelResolver } from "../../contracts/model-resolver";
import type { SessionEventConsumer } from "../../contracts/session-event-consumer";
import type { ToolSource } from "../../contracts/tool-source";
import { OffloadPolicy } from "../../domain/artifact/offload-policy";
import { RunLimits } from "../../domain/session/run-limits";
import type { AdkApprovalPolicy } from "../../domain/tool/adk-approval-policy";
import { EffectApprovalPolicy } from "../../domain/tool/effect-approval-policy";
import { ShutdownOptions } from "../lifecycle/shutdown-options";
import { SnapshotPolicy } from "../session/snapshot/snapshot-policy";

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
	) {}
}
