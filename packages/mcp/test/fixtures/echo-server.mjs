// Fixture MCP server (stdio) for @nestjs-adk/mcp integration tests.
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";

const server = new McpServer({ name: "fixture", version: "1.0.0" });

server.registerTool(
	"echo",
	{ description: "Echoes the received message.", inputSchema: { message: z.string().describe("Message.") } },
	async ({ message }) => ({ content: [{ type: "text", text: `echo:${message}` }] }),
);

server.registerTool("boom", { description: "Always fails." }, async () => ({
	isError: true,
	content: [{ type: "text", text: "kaboom" }],
}));

await server.connect(new StdioServerTransport());
