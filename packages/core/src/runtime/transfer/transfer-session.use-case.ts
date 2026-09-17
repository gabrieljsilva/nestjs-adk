import type { AgentName } from "../../domain/agent/agent-name.value-object";
import type { AgentCatalog } from "../catalog/agent-catalog.service";
import type { ModelService } from "../model/model.service";
import type { RunScopeFactory } from "../run/scope/run-scope.factory";
import type { RunScope } from "../run/scope/run-scope.value-object";

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
export class TransferSessionUseCase {
	public constructor(
		private readonly catalog: AgentCatalog,
		private readonly models: ModelService,
		private readonly scopes: RunScopeFactory,
	) {}

	public async execute(scope: RunScope, target: AgentName): Promise<RunScope> {
		const definition = this.catalog.findOrFail(target);
		return await this.scopes.switched(scope, definition, this.models.resolve(definition));
	}
}
