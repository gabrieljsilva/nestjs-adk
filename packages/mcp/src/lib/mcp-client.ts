import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { SSEClientTransport } from "@modelcontextprotocol/sdk/client/sse.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { McpConnectionError, type ResolvedTool, type ToolsetRef, ToolsetResolver } from "@nestjs-adk/core";
import { Inject, Injectable, Logger, type OnModuleDestroy, type OnModuleInit } from "@nestjs/common";
import { jsonSchemaToZod } from "./json-schema-to-zod";
import { MCP_OPTIONS, type McpModuleOptions, type McpServerConfig, type McpTransportConfig } from "./mcp-options";

interface McpToolInfo {
	name: string;
	description: string;
	inputSchema: unknown;
}

interface ServerCatalog {
	client: Client;
	tools: McpToolInfo[];
}

/**
 * MCP client: connects at boot, caches the tool catalog, and implements
 * ToolsetResolver — MCP tools become regular ResolvedTools (same pipeline: offload, events).
 * A runtime tool failure comes back as `{ error }` TO THE LLM, not as an exception.
 */
@Injectable()
export class McpClient extends ToolsetResolver implements OnModuleInit, OnModuleDestroy {
	private readonly logger = new Logger(McpClient.name);
	private readonly catalogs = new Map<string, ServerCatalog>();

	public constructor(@Inject(MCP_OPTIONS) private readonly options: McpModuleOptions) {
		super();
	}

	public async onModuleInit(): Promise<void> {
		for (const server of this.options.servers) {
			try {
				await this.connect(server);
			} catch (error) {
				if (server.optional) {
					this.logger.warn(`MCP server "${server.name}" unavailable (optional) — tools ignored.`);
					continue;
				}
				throw new McpConnectionError(server.name, error);
			}
		}
	}

	public async onModuleDestroy(): Promise<void> {
		for (const { client } of this.catalogs.values()) {
			await client.close().catch(() => undefined);
		}
	}

	public async resolve(ref: ToolsetRef): Promise<ResolvedTool[]> {
		const catalog = this.catalogs.get(ref.__adkToolset);
		if (!catalog) {
			const configured = this.options.servers.some((server) => server.name === ref.__adkToolset);
			if (configured) return []; // optional and down — the agent boots without these tools
			throw new McpConnectionError(ref.__adkToolset, new Error("server is not configured in McpModule.forRoot"));
		}

		const tools = ref.filter ? catalog.tools.filter((tool) => ref.filter?.includes(tool.name)) : catalog.tools;

		return tools.map((tool) => ({
			name: tool.name,
			description: tool.description,
			schema: jsonSchemaToZod(tool.inputSchema),
			execute: async (input: unknown) => this.callTool(catalog.client, tool.name, input),
		}));
	}

	private async callTool(client: Client, name: string, input: unknown): Promise<unknown> {
		try {
			const result = await client.callTool({ name, arguments: (input ?? {}) as Record<string, unknown> });
			const texts = ((result.content ?? []) as Array<{ type: string; text?: string }>)
				.filter((part) => part.type === "text")
				.map((part) => part.text ?? "");

			if (result.isError) return { error: texts.join("\n") || `MCP tool "${name}" failed.` };
			if (result.structuredContent) return result.structuredContent;
			return texts.length === 1 ? texts[0] : texts.join("\n");
		} catch (error) {
			// Runtime failure goes back TO THE LLM (the agent can adapt)
			return { error: `MCP tool "${name}" failed: ${error instanceof Error ? error.message : String(error)}` };
		}
	}

	private async connect(server: McpServerConfig): Promise<void> {
		const client = new Client({ name: "nestjs-adk", version: "1.0.0" });
		await client.connect(this.createTransport(server.transport));

		const { tools } = await client.listTools();
		this.catalogs.set(server.name, {
			client,
			tools: tools.map((tool) => ({
				name: tool.name,
				description: tool.description ?? "",
				inputSchema: tool.inputSchema,
			})),
		});
		this.logger.log(`MCP server "${server.name}" connected — ${tools.length} tools in the catalog.`);
	}

	private createTransport(transport: McpTransportConfig) {
		switch (transport.type) {
			case "stdio":
				return new StdioClientTransport({
					command: transport.command,
					args: transport.args,
					env: transport.env ? { ...cleanEnv(process.env), ...transport.env } : undefined,
				});
			case "http":
				return new StreamableHTTPClientTransport(new URL(transport.url), {
					requestInit: { headers: transport.headers },
				});
			case "sse":
				return new SSEClientTransport(new URL(transport.url), { requestInit: { headers: transport.headers } });
		}
	}
}

function cleanEnv(env: NodeJS.ProcessEnv): Record<string, string> {
	return Object.fromEntries(Object.entries(env).filter(([, value]) => value !== undefined)) as Record<string, string>;
}
