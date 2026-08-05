// Fixture MCP server (stdio) for @nestjs-adk/mcp integration tests.
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";

const server = new McpServer({ name: "fixture", version: "1.0.0" });

// Annotated read-only: without it the spec defaults land the tool on `destructive` and every call
// would pause for approval, which is its own test, not these.
server.registerTool(
	"echo",
	{
		description: "Echoes the received message.",
		inputSchema: { message: z.string().describe("Message.") },
		annotations: { readOnlyHint: true },
	},
	async ({ message }) => ({ content: [{ type: "text", text: `echo:${message}` }] }),
);

server.registerTool("boom", { description: "Always fails.", annotations: { readOnlyHint: true } }, async () => ({
	isError: true,
	content: [{ type: "text", text: "kaboom" }],
}));

// Reports the secret it was started with, so a test can prove the credential reached the process.
server.registerTool(
	"whoami",
	{ description: "Reports the caller identity.", annotations: { readOnlyHint: true } },
	async () => ({
		content: [{ type: "text", text: process.env.FIXTURE_TOKEN ?? "anonymous" }],
	}),
);

await server.connect(new StdioServerTransport());
