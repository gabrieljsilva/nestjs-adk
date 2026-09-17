import type { AgentName } from "../../domain/agent/agent-name.value-object";
import type { AgentCatalog } from "../catalog/agent-catalog.service";
import type { ModelService } from "../model/model.service";
import type { RunScopeFactory } from "../run/scope/run-scope.factory";
import type { RunScope } from "../run/scope/run-scope.value-object";

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
