import { TRANSFERS_TO_METADATA } from "../constants";

/**
 * Declares which agents this one may hand a conversation to.
 *
 * Targets are agent names, not classes: two agents that hand work to each other would be
 * a circular import as classes, and the runtime looks agents up by name anyway. Every
 * name must belong to a registered agent, which is checked at boot.
 *
 * This replaces `@Agent({ subAgents })`. The old key described a tree of ownership and was
 * used to mean a handover, and the two are not the same thing: an agent is offered exactly
 * the targets it declared here, and reaches nothing else.
 *
 * ```ts
 * @Agent({ name: "support", description: "Answers first." })
 * @TransfersTo("billing", "escalation")
 * export class SupportAgent {}
 * ```
 */
export function TransfersTo(...agentNames: string[]): ClassDecorator {
	return (target) => {
		Reflect.defineMetadata(TRANSFERS_TO_METADATA, [...agentNames], target);
	};
}
