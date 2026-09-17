import type { ModuleMetadata, Type } from "@nestjs/common";
import type { McpActorResolver } from "./mcp-actor-resolver.contract";

/**
 * What the MCP endpoint publishes and where. `actors` is the application's resolver, exported by
 * one of the modules in `imports`, and `decorate` applies class decorators to the generated
 * controller, for whatever the application does to every route.
 */
export interface McpServerOptions {
	path?: string;
	name: string;
	version: string;
	actors: Type<McpActorResolver>;
	imports?: ModuleMetadata["imports"];
	decorate?: readonly ClassDecorator[];
}
