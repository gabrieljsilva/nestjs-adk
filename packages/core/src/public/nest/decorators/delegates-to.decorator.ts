import { DELEGATES_TO_METADATA } from "../../../adapters/nest/metadata-keys";
import type { AgentTarget } from "../agent-target";

/**
 * Declares which agents this one may hand a single task to, keeping the conversation.
 *
 * Delegation is not transfer. A transfer says somebody else owns the session from here on;
 * a delegation asks one question, reads the answer and carries on. Use this when a
 * specialist should produce something the asking agent still has to act on.
 *
 * Targets take the same three forms as `@TransfersTo`: the class, a function returning it
 * when the two agents reach each other, or a plain name. Every one of them has to be a
 * registered provider, which is checked at boot.
 *
 * ```ts
 * @Agent({ name: "support", description: "Answers first." })
 * @DelegatesTo(ResearcherAgent)
 * export class SupportAgent {}
 * ```
 */
export function DelegatesTo(...targets: AgentTarget[]): ClassDecorator {
	return (target) => {
		Reflect.defineMetadata(DELEGATES_TO_METADATA, [...targets], target);
	};
}
