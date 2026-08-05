import type { ModelResolver } from "../../contracts/model-resolver";
import type { RunLimits } from "../../domain/session/run-limits";
import type { ToolDefinition } from "../../domain/tool/tool-definition";
import type { ArtifactOffloader } from "../artifact/artifact-offloader";
import type { AgentCatalog } from "../catalog/agent-catalog";
import type { EventPublisher } from "../event/event-publisher";
import type { ActiveRunTracker } from "../lifecycle/active-run-tracker";
import type { RuntimeLifecycle } from "../lifecycle/runtime-lifecycle";
import type { AgentRunFactory } from "../run/agent-run-factory";
import type { AgentRunner } from "../run/agent-runner";
import type { InspectSession } from "../session/inspect-session";

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
		/** The read half: where a session stands, for a caller that is not running anything. */
		public readonly sessions: InspectSession,
		public readonly runs: AgentRunFactory,
		public readonly events: EventPublisher,
		public readonly offloader: ArtifactOffloader,
		public readonly readArtifact: ToolDefinition,
		public readonly lifecycle: RuntimeLifecycle,
		public readonly tracker: ActiveRunTracker,
		public readonly limits: RunLimits,
	) {}
}
