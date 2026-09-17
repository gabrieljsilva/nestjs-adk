import type { Actor } from "@nestjs-adk/core";
import type { McpRequest } from "./mcp-request.value-object";

/**
 * Who is calling, decided by the application from the request. Implement it as an injectable
 * provider and name it in `McpServerModule.forRoot`.
 *
 * Throw `McpUnauthorizedError` when the request carries no usable identity; its challenge is
 * what the endpoint writes back as `WWW-Authenticate`. The module itself never sees a credential.
 */
export abstract class McpActorResolver {
	public abstract resolve(request: McpRequest): Promise<Actor>;
}
