import type { ModelResolver } from "../../contracts/model-resolver";
import type { AgentName } from "../../domain/agent/agent-name";
import { AgentTransferred } from "../../domain/event/catalog/agent-transferred";
import type { SessionEventBatch } from "../../domain/event/session-event-batch";
import type { AgentCatalog } from "../catalog/agent-catalog";
import type { RunScope } from "../run/run-scope";
import type { RunScopeFactory } from "../run/run-scope-factory";

/**
 * Puts a different agent behind a run that is already going.
 *
 * The handover is read from the batch that was just committed rather than from anything
 * held in memory: the event is what made the transfer real, so the event is what decides
 * that it happened. Nothing else in the run has to be told.
 *
 * What comes back is a scope, not a new run. The session id, the run id, the cancellation
 * and everything already spent stay exactly where they were, which is what makes a
 * transfer a change of who answers rather than a second conversation.
 */
export class AgentSwitch {
	public constructor(
		private readonly catalog: AgentCatalog,
		private readonly models: ModelResolver,
		private readonly scopes: RunScopeFactory,
	) {}

	/** The agent a committed batch handed the session to, or nothing when it handed it to nobody. */
	public requestedIn(batch: SessionEventBatch): AgentName | undefined {
		const transferred = batch.events.filter((event) => event instanceof AgentTransferred);
		return transferred.at(-1)?.to;
	}

	public to(scope: RunScope, target: AgentName): RunScope {
		const definition = this.catalog.findOrFail(target);
		return this.scopes.switched(scope, definition, this.models.resolve(definition));
	}
}
