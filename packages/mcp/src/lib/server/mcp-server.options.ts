import type { ModuleMetadata, Type } from "@nestjs/common";
import type { McpActorResolver } from "./mcp-actor-resolver.contract";

export interface McpServerOptions {
	/** Where the server listens, relative to the application's global prefix. Defaults to `/mcp`. */
	path?: string;
	/** How the server introduces itself to a client. */
	name: string;
	version: string;
	/**
	 * The application's class that turns a request into an actor. It is provided and exported by one
	 * of the modules in `imports`, where its own dependencies live; this module only injects it.
	 */
	actors: Type<McpActorResolver>;
	/** The modules the resolver comes from, and any other the endpoint needs. */
	imports?: ModuleMetadata["imports"];
	/**
	 * Decorators applied to the endpoint's controller class, for what the application does to
	 * every route: marking it public to a global guard, throttling it, picking an exception filter.
	 */
	decorate?: readonly ClassDecorator[];
}
