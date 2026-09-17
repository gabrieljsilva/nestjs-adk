import type { ToolInvocation } from "../invocation/tool-invocation";
import type { ToolDefinition } from "../tool-definition";
import type { Actor } from "./actor";
import type { ToolAccess } from "./tool-access";

/**
 * Whether this actor may call this tool with these arguments.
 *
 * The runtime asks before every invocation, on the agent's path and on the MCP server's path
 * alike, after the arguments were parsed and before any approval is requested: nobody should be
 * asked to approve a call the actor could not make. `actor` is absent when the caller declared
 * none, and a policy decides what that means; the one shipped by default grants everything, which
 * is what an application that wrote no policy meant.
 */
export abstract class AdkAccessPolicy {
	public abstract decide(
		tool: ToolDefinition,
		invocation: ToolInvocation,
		actor: Actor | undefined,
	): ToolAccess | Promise<ToolAccess>;
}
