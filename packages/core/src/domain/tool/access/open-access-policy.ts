import type { ToolInvocation } from "../invocation/tool-invocation";
import type { ToolDefinition } from "../tool-definition";
import type { Actor } from "./actor";
import { AdkAccessPolicy } from "./adk-access-policy";
import { ToolAccess } from "./tool-access";

/** Grants every call to everyone, with or without an actor: the policy of an application that declared none. */
export class OpenAccessPolicy extends AdkAccessPolicy {
	public decide(_tool: ToolDefinition, _invocation: ToolInvocation, _actor: Actor | undefined): ToolAccess {
		return ToolAccess.granted();
	}
}
