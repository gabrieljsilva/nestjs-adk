import type { Actor } from "./actor";
import type { ToolDefinition } from "./tool-definition";
import type { ToolInvocation } from "./tool-invocation";

/**
 * Whether a human has to agree before this call runs.
 *
 * Extend it and register the subclass as a provider to decide approval yourself:
 *
 * ```ts
 * @Injectable()
 * export class BusinessHoursApproval extends AdkApprovalPolicy {
 *   public requires(tool: ToolDefinition): boolean {
 *     return tool.effect.isAtLeast(ToolEffect.WRITE) && !this.hours.areOpen();
 *   }
 * }
 * ```
 *
 * It is asked before the handler runs and never after, because the point of asking is
 * that the effect has not happened yet. The invocation is available so a policy can
 * decide on the arguments as well as on the tool: refunding one currency unit and
 * refunding a thousand are the same tool. The actor is who asked, when the run was given
 * one: a policy that lets one person run what another has to confirm reads it here, and
 * a run without an actor reaches the policy as `undefined`.
 */
export abstract class AdkApprovalPolicy {
	public abstract requires(tool: ToolDefinition, invocation: ToolInvocation, actor?: Actor): boolean;
}
