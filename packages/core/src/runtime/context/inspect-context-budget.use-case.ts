import type { SessionId } from "../../common/identity/session-id.value-object";
import type { AgentName } from "../../domain/agent/agent-name.value-object";
import { ContextBudget } from "../../domain/context/context-budget.value-object";
import type { AgentCatalog } from "../catalog/agent-catalog.service";
import type { InspectSessionUseCase } from "../session/inspect-session.use-case";

export class InspectContextBudgetUseCase {
	public constructor(
		private readonly inspecting: InspectSessionUseCase,
		private readonly catalog: AgentCatalog,
	) {}

	public async execute(agent: AgentName, sessionId: SessionId): Promise<ContextBudget> {
		const descriptor = this.catalog.findOrFail(agent).model.descriptor();
		const inspection = await this.inspecting.execute(sessionId);
		return new ContextBudget(descriptor.contextWindow, inspection.lastPrompt?.takenBy(descriptor.identity));
	}
}
