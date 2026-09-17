import type { ArtifactStorage } from "../../contracts/storage/artifact-storage.contract";
import type { SessionStorage } from "../../contracts/storage/session-storage.contract";
import { AttachmentReader } from "../artifact/attachment-reader.service";
import { ContextMeasurer } from "../context/context-measurer.service";
import { ContextProjector } from "../context/context-projector.service";
import { ContextWindowNotifier } from "../context/context-window-notifier.service";
import { ContextService } from "../context/context.service";
import { OldestFirstCompactionStrategy } from "../context/oldest-first-compaction.strategy";
import { StablePrefixDigest } from "../context/stable-prefix-digest.service";
import type { ContextOptions } from "./context.options";

export class ContextComposer {
	public compose(storage: SessionStorage, artifacts: ArtifactStorage, options: ContextOptions): ContextService {
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
