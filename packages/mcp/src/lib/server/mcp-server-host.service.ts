import type { IncomingMessage, ServerResponse } from "node:http";
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { CallToolRequestSchema, ListToolsRequestSchema } from "@modelcontextprotocol/sdk/types.js";
import type { Actor } from "@nestjs-adk/core";
import { McpCall } from "./mcp-call.value-object";
import type { McpServerInfo } from "./mcp-server-info.value-object";
import type { McpToolService } from "./mcp-tool.service";

/**
 * Serves one HTTP request of the MCP protocol for one actor.
 *
 * A protocol server and its transport are built per request and discarded with it, which is the
 * stateless shape of the streamable HTTP transport: nothing about a client is kept between
 * requests, so two instances behind a balancer answer alike, and the actor is bound by closure to
 * the handlers of this request and reachable from no other.
 */
export class McpServerHost {
	public constructor(
		private readonly tools: McpToolService,
		private readonly info: McpServerInfo,
	) {}

	public async serve(request: IncomingMessage, response: ServerResponse, body: unknown, actor: Actor): Promise<void> {
		const server = this.serverFor(actor);
		const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined });
		response.on("close", () => {
			void transport.close();
			void server.close();
		});
		await server.connect(transport);
		await transport.handleRequest(request, response, body);
	}

	private serverFor(actor: Actor): Server {
		const server = new Server({ name: this.info.name, version: this.info.version }, { capabilities: { tools: {} } });
		server.setRequestHandler(ListToolsRequestSchema, async () => ({ tools: this.tools.list() }));
		server.setRequestHandler(CallToolRequestSchema, async (request, extra) =>
			this.tools.call(
				request.params.name,
				request.params.arguments,
				actor,
				McpCall.of(extra.requestId, extra.sessionId, extra.signal),
			),
		);
		return server;
	}
}
