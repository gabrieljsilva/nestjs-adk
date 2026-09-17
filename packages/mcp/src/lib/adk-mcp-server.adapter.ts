import { UnauthorizedError } from "@modelcontextprotocol/sdk/client/auth.js";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { SseError } from "@modelcontextprotocol/sdk/client/sse.js";
import { StreamableHTTPError } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import {
	type AgentRunId,
	JsonSchemaToolSchema,
	type SessionId,
	ToolDefinition,
	ToolEffect,
	ToolHandler,
	ToolSource,
	ToolSourceAuthError,
	ToolSourceUnavailableError,
} from "@nestjs-adk/core";
import { Logger } from "@nestjs/common";
import { McpBlockedTargetError } from "./errors/mcp-blocked-target.error";

import { McpReauthRequiredError } from "./errors/mcp-reauth-required.error";
import { McpTokenGrantError } from "./errors/mcp-token-grant.error";
import type { AdkMcpAuth } from "./mcp-auth.service";
import { readEffectName } from "./mcp-effect.mapper";
import { type TargetTrust, assertSafeTarget, guardedFetch } from "./mcp-target-guard.service";
import { McpToolFilter } from "./mcp-tool-filter.service";
import { McpToolName } from "./mcp-tool-name.value-object";
import { createTransport } from "./mcp-transport.factory";
import type { McpTransportConfig } from "./mcp.options";

/**
 * One MCP connection, as the application declares it. `name` is the connection's identity
 * inside a run, published to the model as `mcp__<name>__<tool>`, so it names the installation
 * and not the integration; `id` is the connection key and is derived from the transport and the
 * credential when it is left out.
 *
 * `tools` narrows the catalog and `excludeTools` keeps tools out of it, with exclusion winning.
 * `trustAnnotations` and `allowPrivateNetwork` both default to the cautious answer: a server's
 * own effect hints are ignored, and a private, loopback or cleartext target is refused.
 */
export interface AdkMcpServerOptions {
	name: string;
	id?: string;
	transport: McpTransportConfig;
	auth?: AdkMcpAuth;
	tools?: string[];
	excludeTools?: string[];
	trustAnnotations?: boolean;
	allowPrivateNetwork?: boolean;
}

/**
 * One MCP server as a `ToolSource`: its catalog becomes tools the agent can call, through the
 * same validation, approval and events as the tools the application wrote.
 *
 * Declare it on the module for a server the application owns, or pass it on the call for one the
 * end user connected; either way it opens when the run starts and closes when the run ends, so
 * one user's connection never outlives their question. An invalid `name` throws
 * `McpInvalidSourceNameError` from the constructor, a stale credential reaches the runtime as a
 * reauth event, and a refused target or unreachable server as unavailable.
 */
export class AdkMcpServer extends ToolSource {
	private readonly logger = new Logger("Adk:mcp");
	public readonly name: string;
	private readonly filter: McpToolFilter;
	private readonly naming: McpToolName;
	private client?: Client;
	private borrowed = false;

	public constructor(protected readonly options: AdkMcpServerOptions) {
		super();
		this.naming = McpToolName.forSource(options.name);
		this.name = options.name;
		this.filter = new McpToolFilter(options.tools, options.excludeTools);
	}

	public get id(): string {
		if (this.options.id) return this.options.id;
		const target =
			this.options.transport.type === "stdio"
				? `${this.options.transport.command} ${(this.options.transport.args ?? []).join(" ")}`
				: this.options.transport.url;
		return `${this.options.transport.type}:${target}:${this.options.auth?.fingerprint() ?? "anonymous"}`;
	}

	public async open(_sessionId: SessionId, _runId: AgentRunId, signal?: AbortSignal): Promise<ToolDefinition[]> {
		let credential: Awaited<ReturnType<AdkMcpAuth["resolve"]>> | undefined;
		try {
			credential = await this.options.auth?.resolve();
		} catch (error) {
			if (error instanceof McpReauthRequiredError) throw new ToolSourceAuthError(this.name, error.reason);
			if (error instanceof McpTokenGrantError) throw new ToolSourceUnavailableError(this.name, error);
			throw error;
		}

		if (this.client) {
			this.borrowed = true;
			throw new ToolSourceUnavailableError(this.name, new Error("already open in another run"));
		}

		const trust: TargetTrust = this.options.allowPrivateNetwork ? "private-ok" : "user";
		let guard: typeof fetch | undefined;
		if (this.options.transport.type !== "stdio") {
			try {
				await assertSafeTarget(this.options.transport.url, trust);
			} catch (error) {
				if (error instanceof McpBlockedTargetError) {
					this.logger.error(error.message);
					throw new ToolSourceUnavailableError(this.name, error);
				}
				throw error;
			}
			guard = guardedFetch(trust);
		}

		const client = new Client({ name: "nestjs-adk", version: "1.0.0" });
		this.client = client;
		try {
			await client.connect(createTransport(this.options.transport, credential, guard), { signal });
			const { tools } = await client.listTools(undefined, { signal });
			return this.toDefinitions(tools);
		} catch (error) {
			if (isUnauthorized(error)) throw new ToolSourceAuthError(this.name, "server rejected the credential");
			throw new ToolSourceUnavailableError(this.name, error);
		}
	}

	public async close(_runId?: AgentRunId): Promise<void> {
		if (this.borrowed) {
			this.borrowed = false;
			return;
		}
		const client = this.client;
		this.client = undefined;
		await client?.close();
	}

	private toDefinitions(tools: Awaited<ReturnType<Client["listTools"]>>["tools"]): ToolDefinition[] {
		return tools
			.filter((tool) => {
				if (this.filter.admits(tool.name)) return true;
				if (McpToolName.isUsable(tool.name)) {
					this.logger.debug(`leaving out tool "${tool.name}" of server "${this.name}"`);
				} else {
					this.logger.warn(`ignoring tool with unusable name from server "${this.name}"`);
				}
				return false;
			})
			.map(
				(tool) =>
					new ToolDefinition(
						this.naming.qualify(tool.name),
						tool.description ?? "",
						new JsonSchemaToolSchema(tool.inputSchema ?? { type: "object" }),
						this.readEffect(tool.annotations),
						new McpToolHandler(this, tool.name),
					),
			);
	}

	private readEffect(annotations: Parameters<typeof readEffectName>[0]): ToolEffect {
		if (this.options.trustAnnotations === false) return ToolEffect.DESTRUCTIVE;
		return ToolEffect.fromName(readEffectName(annotations)) ?? ToolEffect.DESTRUCTIVE;
	}

	public async callTool(name: string, input: unknown): Promise<unknown> {
		if (!this.filter.admits(name)) {
			this.logger.warn(`refused call to tool "${name}" not available on server "${this.name}"`);
			return { error: `MCP tool "${name}" is not available on server "${this.name}".` };
		}
		if (!this.client) return { error: `MCP server "${this.name}" is not connected.` };
		try {
			const result = await this.client.callTool({ name, arguments: (input ?? {}) as Record<string, unknown> });
			const texts = ((result.content ?? []) as Array<{ type: string; text?: string }>)
				.filter((part) => part.type === "text")
				.map((part) => part.text ?? "");

			if (result.isError) return { error: texts.join("\n") || `MCP tool "${name}" failed.` };
			if (result.structuredContent) return result.structuredContent;
			return texts.length === 1 ? texts[0] : texts.join("\n");
		} catch (error) {
			return { error: `MCP tool "${name}" failed: ${error instanceof Error ? error.message : String(error)}` };
		}
	}
}

function isUnauthorized(error: unknown): boolean {
	if (error instanceof UnauthorizedError) return true;
	if (error instanceof StreamableHTTPError || error instanceof SseError) {
		return error.code === 401 || error.code === 403;
	}
	return false;
}

class McpToolHandler extends ToolHandler {
	public constructor(
		private readonly server: AdkMcpServer,
		private readonly tool: string,
	) {
		super();
	}

	public async invoke(args: Record<string, unknown>): Promise<unknown> {
		return this.server.callTool(this.tool, args);
	}
}
