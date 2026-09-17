import type { IncomingMessage, ServerResponse } from "node:http";
import { Body, Controller, Delete, Get, Post, Req, Res } from "@nestjs/common";
import { McpUnauthorizedError } from "./errors/mcp-unauthorized.error";
import { McpActorResolver } from "./mcp-actor-resolver.contract";
import { McpRequest } from "./mcp-request.value-object";
import { McpServerHost } from "./mcp-server-host.service";

const UNAUTHORIZED = 401;

@Controller()
export class McpEndpointController {
	public constructor(
		private readonly host: McpServerHost,
		private readonly actors: McpActorResolver,
	) {}

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
