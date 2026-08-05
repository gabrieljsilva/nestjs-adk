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
 * refunding a thousand are the same tool.
 */
export abstract class AdkApprovalPolicy {
	public abstract requires(tool: ToolDefinition, invocation: ToolInvocation): boolean;
}
