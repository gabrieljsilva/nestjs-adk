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
 * The resolved services a started runtime hands to the application: the agent catalog, the
 * model resolver, the runner, sessions, events, lifecycle and the tool gate an MCP server
 * admits calls with.
 *
 * It carries the module level `limits`, which an agent and then a call may narrow further.
 */
export class RuntimeServices {
	public constructor(
		public readonly catalog: AgentCatalog,
		public readonly models: ModelResolver,
		public readonly runner: AgentRunner,
		public readonly sessions: SessionService,
		public readonly runs: AgentRunFactory,
		public readonly events: EventPublisher,
		public readonly offloader: ArtifactOffloader,
		public readonly readArtifact: ToolDefinition,
		public readonly lifecycle: RuntimeLifecycle,
		public readonly tracker: ActiveRunTracker,
		public readonly limits: RunLimits,
		public readonly gate: ToolGate,
		public readonly exposed: ToolCatalog,
	) {}
}
