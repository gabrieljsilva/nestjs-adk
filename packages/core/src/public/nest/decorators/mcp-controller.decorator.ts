import { Injectable } from "@nestjs/common";
import { MCP_CONTROLLER_METADATA } from "../../../adapters/nest/metadata/metadata-keys.token";

/** Shared `@Tool` classes this controller publishes, or the names they declared. A class an agent also lists is the same tool, published once. */
export interface McpControllerOptions {
	tools?: readonly unknown[];
}

function markInjectable(target: object): void {
	const decorate = Injectable();
	decorate(Object(target));
}

/**
 * Declares a class that publishes tools to MCP clients, the way `@Agent` declares one that
 * offers tools to a model. A `@Tool` method on the class is published by this controller alone
 * and never reaches an agent; a shared class listed by both belongs to both worlds.
 *
 * The class is a provider, not an HTTP controller: the endpoint belongs to the server module
 * of `@nestjs-adk/mcp`. Who may call what is the access policy, asked through the same gate as
 * on the agent's path.
 */
export function McpController(options: McpControllerOptions = {}): ClassDecorator {
	return (target) => {
		Reflect.defineMetadata(MCP_CONTROLLER_METADATA, options, target);
		markInjectable(target);
	};
}
