import type { IncomingMessage, ServerResponse } from "node:http";
import { Body, Controller, Delete, Get, Post, Req, Res } from "@nestjs/common";
import { McpUnauthorizedError } from "./errors/mcp-unauthorized.error";
import { McpActorResolver } from "./mcp-actor-resolver.contract";
import { McpRequest } from "./mcp-request.value-object";
import { McpServerHost } from "./mcp-server-host.service";

const UNAUTHORIZED = 401;

/**
 * The one route of the server. `McpServerModule.forRoot` mounts a subclass of it at the path the
 * application chose, so two servers in one process never share route metadata.
 *
 * Every request is resolved to an actor first, and a refusal answers the OAuth shape of a 401:
 * the resolver's challenge in `WWW-Authenticate`, which is where an MCP client reads how to get
 * authorized, and an `invalid_token` body. Only then does the protocol see the request.
 */
@Controller()
export class McpEndpointController {
	public constructor(
		private readonly host: McpServerHost,
		private readonly actors: McpActorResolver,
	) {}

	// The three methods the streamable HTTP transport speaks: a request, a listening stream, and the
	// end of a session. `@All()` would answer the rest too, and register verbs (SEARCH among them)
	// that OpenAPI tooling downstream of the application refuses to parse.
	@Post()
	@Get()
	@Delete()
	public async receive(
		@Req() request: IncomingMessage,
		@Res() response: ServerResponse,
		@Body() body: unknown,
	): Promise<void> {
		const resolved = await this.resolveActor(request);
		if (resolved instanceof McpUnauthorizedError) {
			McpEndpointController.refuse(response, resolved);
			return;
		}
		await this.host.serve(request, response, body, resolved);
	}

	private async resolveActor(request: IncomingMessage) {
		try {
			return await this.actors.resolve(new McpRequest(request.headers, request.method, request.url));
		} catch (error) {
			if (error instanceof McpUnauthorizedError) return error;
			throw error;
		}
	}

	private static refuse(response: ServerResponse, refusal: McpUnauthorizedError): void {
		response.statusCode = UNAUTHORIZED;
		if (refusal.challenge !== undefined) response.setHeader("WWW-Authenticate", refusal.challenge);
		response.setHeader("Content-Type", "application/json");
		response.end(JSON.stringify({ error: "invalid_token", error_description: refusal.reason }));
	}
}
