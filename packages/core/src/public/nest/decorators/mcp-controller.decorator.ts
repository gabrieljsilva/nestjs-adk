import { Injectable } from "@nestjs/common";
import { MCP_CONTROLLER_METADATA } from "../../../adapters/nest/metadata-keys";

export interface McpControllerOptions {
	/** Shared `@Tool` classes this controller publishes, or the names they declared. A class an agent also lists is the same tool, published once. */
	tools?: readonly unknown[];
}

function markInjectable(target: object): void {
	const decorate = Injectable();
	decorate(Object(target));
}

/**
 * Declares a class that publishes tools to MCP clients, the way `@Agent` declares one that
 * offers tools to a model: `tools` lists shared `@Tool` classes, and a `@Tool` method on the
 * class itself is published by this controller alone. A tool that belongs to both worlds is a
 * shared class listed by an agent and by a controller; a tool a method declares here never
 * reaches an agent, and a method declared on an agent never reaches a client.
 *
 * The class is a provider, not an HTTP controller: the endpoint that serves what it publishes
 * belongs to the server module of `@nestjs-adk/mcp`, which reads every controller of the
 * container. Nothing here decides who may call what. That is the access policy, asked on the
 * agent's path and on the client's path through the same gate.
 */
export function McpController(options: McpControllerOptions = {}): ClassDecorator {
	return (target) => {
		Reflect.defineMetadata(MCP_CONTROLLER_METADATA, options, target);
		markInjectable(target);
	};
}
