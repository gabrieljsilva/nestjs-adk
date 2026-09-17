import type { Actor } from "@nestjs-adk/core";
import type { McpRequest } from "./mcp-request.value-object";

/**
 * Who is calling, decided by the application from the request.
 *
 * The server never sees a credential and never learns how one is checked: a bearer against an
 * OAuth issuer, an API key against a table, a session cookie. The resolver answers an `Actor`
 * or throws `McpUnauthorizedError`, whose challenge the endpoint returns as `WWW-Authenticate`.
 * The actor it answers is the one every tool of the request receives as `context.actor`, and
 * the one the access policy judges, exactly as on the agent's path.
 */
export abstract class McpActorResolver {
	public abstract resolve(request: McpRequest): Promise<Actor>;
}
