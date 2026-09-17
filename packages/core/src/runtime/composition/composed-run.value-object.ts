import type { ModelResolver } from "../../contracts/model/model-resolver.contract";
import type { ToolDefinition } from "../../domain/tool/tool-definition.value-object";
import type { ArtifactExplorer } from "../artifact/artifact-explorer.service";
import type { ArtifactOffloader } from "../artifact/artifact-offloader.service";
import type { EventPublisher } from "../event/event-publisher.service";
import type { ActiveRunTracker } from "../lifecycle/active-run-tracker.service";
import type { RuntimeLifecycle } from "../lifecycle/runtime-lifecycle.service";
import type { AgentRunFactory } from "../run/agent-run.factory";
import type { AgentRunner } from "../run/agent-runner.service";
import type { RunJournal } from "../run/journal/run-journal.service";
import type { SessionRepository } from "../session/session-repository.service";
import type { ToolGate } from "../tool/tool-gate.service";

export class ComposedRun {
	public constructor(
		public readonly runner: AgentRunner,
		public readonly runs: AgentRunFactory,
		public readonly journal: RunJournal,
		public readonly sessions: SessionRepository,
		public readonly events: EventPublisher,
		public readonly resolver: ModelResolver,
		public readonly tracker: ActiveRunTracker,
		public readonly lifecycle: RuntimeLifecycle,
		public readonly offloader: ArtifactOffloader,
		public readonly readArtifact: ToolDefinition,
		public readonly gate: ToolGate,
		public readonly explorer: ArtifactExplorer,
	) {}
}
