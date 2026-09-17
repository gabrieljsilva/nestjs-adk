import { DELEGATES_TO_METADATA } from "../../../adapters/nest/metadata/metadata-keys.token";
import type { AgentTarget } from "../agent/agent-target.value-object";

/**
 * Declares which agents this one may hand a single task to, keeping the conversation here. A
 * transfer says somebody else owns the session from now on; a delegation asks one question and
 * reads the answer.
 *
 * Targets take the same three forms as `@TransfersTo`, and each has to be a registered
 * provider, which is checked at boot.
 */
export function DelegatesTo(...targets: AgentTarget[]): ClassDecorator {
	return (target) => {
		Reflect.defineMetadata(DELEGATES_TO_METADATA, [...targets], target);
	};
}
