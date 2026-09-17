import type { ModelResolver } from "../../contracts/model/model-resolver.contract";
import type { RunLimits } from "../../domain/session/run/run-limits.value-object";
import type { ToolDefinition } from "../../domain/tool/tool-definition.value-object";
import type { ArtifactOffloader } from "../artifact/artifact-offloader.service";
import type { AgentCatalog } from "../catalog/agent-catalog.service";
import type { EventPublisher } from "../event/event-publisher.service";
import type { ActiveRunTracker } from "../lifecycle/active-run-tracker.service";
import type { RuntimeLifecycle } from "../lifecycle/runtime-lifecycle.service";
import type { AgentRunFactory } from "../run/agent-run.factory";
import type { AgentRunner } from "../run/agent-runner.service";
import type { SessionService } from "../session/session.service";
import type { ToolCatalog } from "../tool/tool-catalog.service";
import type { ToolGate } from "../tool/tool-gate.service";

/**
 * What the composition hands back to the public layer.
 *
 * This is the boundary of the private container: callers receive resolved services
 * and never the container itself, so no Wirely type reaches a public declaration.
 *
 * The limits travel with the services because they are the widest of the three levels:
 * the agent narrows them, the call narrows them again, and something has to carry the
 * first one from where it was declared to where a command is built.
 */
export class RuntimeServices {
	public constructor(
		public readonly catalog: AgentCatalog,
		public readonly models: ModelResolver,
		public readonly runner: AgentRunner,
		/** The other half: opening a conversation and reading one, without running anything in it. */
		public readonly sessions: SessionService,
		public readonly runs: AgentRunFactory,
		public readonly events: EventPublisher,
		public readonly offloader: ArtifactOffloader,
		public readonly readArtifact: ToolDefinition,
		public readonly lifecycle: RuntimeLifecycle,
		public readonly tracker: ActiveRunTracker,
		public readonly limits: RunLimits,
		/** The door every tool call passes, held here so a server exposing tools admits them exactly as the loop does. */
		public readonly gate: ToolGate,
		/** What `@McpController` classes published, already checked for clashing names. */
		public readonly exposed: ToolCatalog,
	) {}
}
