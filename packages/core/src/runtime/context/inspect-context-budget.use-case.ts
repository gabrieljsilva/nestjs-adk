import type { SessionId } from "../../common/identity/session-id.value-object";
import type { AgentName } from "../../domain/agent/agent-name.value-object";
import { ContextBudget } from "../../domain/context/context-budget.value-object";
import type { AgentCatalog } from "../catalog/agent-catalog.service";
import type { InspectSession } from "../session/inspect-session.use-case";

/**
 * How full a conversation's context is, without running a turn to find out.
 *
 * It answers about the last call that actually happened, which is the only call anybody
 * counted. Nothing here projects the next prompt: building one means resolving tools,
 * instructions and an agent's own `prompt()`, all of which belong to a run, and the
 * answer would describe a prefix no call ever sent.
 *
 * The window comes from the agent, because a window is a fact about a model and never
 * about a conversation. The measurement is only carried into it when the same model took
 * it: a count from another provider divided by this one's window is a wrong number that
 * looks right, so a conversation continued under a new model reads as unmeasured until
 * that model answers once.
 */
export class InspectContextBudget {
	public constructor(
		private readonly inspecting: InspectSession,
		private readonly catalog: AgentCatalog,
	) {}

	public async handle(agent: AgentName, sessionId: SessionId): Promise<ContextBudget> {
		const descriptor = this.catalog.findOrFail(agent).model.descriptor();
		const inspection = await this.inspecting.handle(sessionId);
		return new ContextBudget(descriptor.contextWindow, inspection.lastPrompt?.takenBy(descriptor.identity));
	}
}
