import { DELEGATES_TO_METADATA } from "../../../adapters/nest/metadata-keys";

/**
 * Declares which agents this one may hand a single task to, keeping the conversation.
 *
 * Delegation is not transfer. A transfer says somebody else owns the session from here on;
 * a delegation asks one question, reads the answer and carries on. Use this when a
 * specialist should produce something the asking agent still has to act on.
 *
 * Targets are agent names, and every one of them must belong to a registered agent, which
 * is checked at boot.
 *
 * ```ts
 * @Agent({ name: "support", description: "Answers first." })
 * @DelegatesTo("researcher")
 * export class SupportAgent {}
 * ```
 */
export function DelegatesTo(...agentNames: string[]): ClassDecorator {
	return (target) => {
		Reflect.defineMetadata(DELEGATES_TO_METADATA, [...agentNames], target);
	};
}
