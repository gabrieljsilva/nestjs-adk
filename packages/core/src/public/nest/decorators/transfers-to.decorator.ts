import { TRANSFERS_TO_METADATA } from "../../../adapters/nest/metadata/metadata-keys.token";
import type { AgentTarget } from "../agent/agent-target.value-object";

/**
 * Declares which agents this one may hand a conversation to. An agent is offered exactly the
 * targets it declared and reaches nothing else, and every target has to be a registered
 * provider, which is checked at boot.
 *
 * ```ts
 * @Agent({ name: "support", description: "Answers first." })
 * @TransfersTo(BillingAgent, () => EscalationAgent, "plugin-agent")
 * export class SupportAgent {}
 * ```
 */
export function TransfersTo(...targets: AgentTarget[]): ClassDecorator {
	return (target) => {
		Reflect.defineMetadata(TRANSFERS_TO_METADATA, [...targets], target);
	};
}
