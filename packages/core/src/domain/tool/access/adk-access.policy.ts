import type { ToolInvocation } from "../invocation/tool-invocation.value-object";
import type { ToolDefinition } from "../tool-definition.value-object";
import type { Actor } from "./actor.value-object";
import type { ToolAccess } from "./tool-access.value-object";

/**
 * Whether this actor may call this tool with these arguments.
 *
 * Asked before every invocation, after the arguments were parsed and before any approval is
 * requested. `actor` is absent when the caller declared none, and the policy decides what that means.
 */
export abstract class AdkAccessPolicy {
	public abstract decide(
		tool: ToolDefinition,
		invocation: ToolInvocation,
		actor: Actor | undefined,
	): ToolAccess | Promise<ToolAccess>;
}
