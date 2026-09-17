import type { IncomingMessage, ServerResponse } from "node:http";
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { CallToolRequestSchema, ListToolsRequestSchema } from "@modelcontextprotocol/sdk/types.js";
import type { Actor } from "@nestjs-adk/core";
import { McpCall } from "./mcp-call.value-object";
import type { McpServerInfo } from "./mcp-server-info.value-object";
import type { McpToolService } from "./mcp-tool.service";

export class McpServerHost {
	public constructor(
		private readonly tools: McpToolService,
		private readonly info: McpServerInfo,
	) {}

	public async serve(request: IncomingMessage, response: ServerResponse, body: unknown, actor: Actor): Promise<void> {
		const server = this.buildServer(actor);
		const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined });
		response.on("close", () => {
			void transport.close();
			void server.close();
		});
		await server.connect(transport);
		await transport.handleRequest(request, response, body);
	}

	private buildServer(actor: Actor): Server {
		const server = new Server({ name: this.info.name, version: this.info.version }, { capabilities: { tools: {} } });
		server.setRequestHandler(ListToolsRequestSchema, async () => ({ tools: this.tools.list() }));
		server.setRequestHandler(CallToolRequestSchema, async (request, extra) =>
			this.tools.call(
				request.params.name,
				request.params.arguments,
				actor,
				McpCall.fromRequest(extra.requestId, extra.sessionId, extra.signal),
			),
		);
		return server;
	}
}
