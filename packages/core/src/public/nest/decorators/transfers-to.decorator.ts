import { TRANSFERS_TO_METADATA } from "../../../adapters/nest/metadata-keys";
import type { AgentTarget } from "../agent-target";

/**
 * Declares which agents this one may hand a conversation to.
 *
 * Name the class. Renaming the agent then follows on its own, the editor finds it, and a
 * target that does not exist fails the build instead of the boot. Two agents that reach each
 * other cannot name each other directly, because a decorator runs while its own class is
 * being defined and the other end is still `undefined` at that moment: pass a function
 * there, and it is called during the scan, once every module has loaded.
 *
 * A plain name still works, and is the only form for an agent whose class this module does
 * not import. Whichever form is used, the target has to be a registered provider, which is
 * checked at boot.
 *
 * This replaces `@Agent({ subAgents })`. The old key described a tree of ownership and was
 * used to mean a handover, and the two are not the same thing: an agent is offered exactly
 * the targets it declared here, and reaches nothing else.
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
