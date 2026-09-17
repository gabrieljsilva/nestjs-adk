import type { Actor } from "../access/actor.value-object";
import type { ToolInvocation } from "../invocation/tool-invocation.value-object";
import type { ToolDefinition } from "../tool-definition.value-object";

/**
 * Whether a human has to agree before this call runs.
 *
 * Asked before the handler runs and never after, so a policy may decide on the arguments as well
 * as on the tool. `actor` is absent when the run was given none.
 */
export abstract class AdkApprovalPolicy {
	public abstract requires(tool: ToolDefinition, invocation: ToolInvocation, actor?: Actor): boolean;
}
