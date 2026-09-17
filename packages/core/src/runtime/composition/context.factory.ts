import type { ArtifactStorage } from "../../contracts/storage/artifact-storage.contract";
import type { SessionStorage } from "../../contracts/storage/session-storage.contract";
import { AttachmentReader } from "../artifact/attachment-reader.service";
import { ContextMeasurer } from "../context/context-measurer.service";
import { ContextProjector } from "../context/context-projector.service";
import { ContextWindowNotifier } from "../context/context-window-notifier.service";
import { ContextService } from "../context/context.service";
import { OldestFirstCompactionStrategy } from "../context/oldest-first-compaction.strategy";
import { StablePrefixDigest } from "../context/stable-prefix-digest.service";
import type { RuntimeOptions } from "./runtime.options";

/**
 * Builds the half of the runtime that turns a journal into what a model reads.
 *
 * The measurer is shared with the compaction strategy on purpose: what decides that a
 * context is too large and what shrinks it have to count the same way, or a compaction
 * ends where the measurement says it never started.
 */
export class ContextComposer {
	public compose(storage: SessionStorage, artifacts: ArtifactStorage, options: RuntimeOptions): ContextService {
		const measurer = new ContextMeasurer();
		return new ContextService(
			storage,
			new ContextProjector(new AttachmentReader(artifacts, options.attachments)),
			measurer,
			new StablePrefixDigest(),
			options.compactionStrategy ?? new OldestFirstCompactionStrategy(measurer, options.summarizer),
			new ContextWindowNotifier(options.contextNotices),
		);
	}
}
