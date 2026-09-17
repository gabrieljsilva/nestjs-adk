import type { ToolInvocation } from "../invocation/tool-invocation.value-object";
import type { ToolDefinition } from "../tool-definition.value-object";
import type { Actor } from "./actor.value-object";
import { AdkAccessPolicy } from "./adk-access.policy";
import { ToolAccess } from "./tool-access.value-object";

/** Grants every call to everyone, with or without an actor: the policy of an application that declared none. */
export class OpenAccessPolicy extends AdkAccessPolicy {
	public decide(_tool: ToolDefinition, _invocation: ToolInvocation, _actor: Actor | undefined): ToolAccess {
		return ToolAccess.granted();
	}
}
