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

import { type AdkMcpAuth, McpReauthRequiredError } from "./mcp-auth";
import { effectOf } from "./mcp-effect";
import type { McpTransportConfig } from "./mcp-options";
import { type TargetTrust, assertSafeTarget, guardedFetch } from "./mcp-target-guard";
import { createTransport } from "./mcp-transport";

/** Same shape Claude Code and Cursor use, so an external tool is recognizable at a glance. */
const PREFIX = "mcp";
/** What a provider will accept as a function name, and what is safe to repeat in a log line. */
const SAFE_TOOL_NAME = /^[A-Za-z0-9_-]{1,64}$/;

export interface AdkMcpServerOptions {
	/**
	 * Identity within a run. Prefixes every tool as `mcp__<name>__<tool>` and must be unique among the
	 * run's sources: it is what tells the model which connection a tool belongs to when the same
	 * server is connected twice under different accounts.
	 */
	name: string;
	/**
	 * Connection key. Supply the id you already have; without one it is derived from the transport and
	 * a hash of the credential, never from the URL alone, or two users of the same server would look
	 * like the same connection.
	 */
	id?: string;
	transport: McpTransportConfig;
	auth?: AdkMcpAuth;
	/** Subset of the server's catalog. Omitted exposes everything the server offers. */
	tools?: string[];
	/**
	 * Whether to derive each tool's `effect` from the server's annotations (`readOnlyHint`,
	 * `destructiveHint`). Annotations are written by the server, so they are untrusted input: a
	 * server that marks a delete as read-only turns approval off by itself. `false` ignores them
	 * and treats every tool from this server as `destructive`. Default: `true`.
	 */
	trustAnnotations?: boolean;
	/**
	 * Allows connecting to private, loopback or link-local addresses, over http too. Default
	 * `false`: this URL came from an end user, and without the guard it reaches the cloud metadata
	 * endpoint or an internal Redis through your network (SSRF). Public targets must speak https
	 * either way: a user's credential over cleartext to a third party has no legitimate case.
	 * Set `true` only when this MCP server belongs to the operator's own network (a local dev
	 * server, an internal corporate MCP), which includes a server the module declares: where the
	 * source was declared is not evidence about the URL, so the guard does not read it.
	 */
	allowPrivateNetwork?: boolean;
}

/**
 * An MCP server as a per-run tool source. Instantiate it directly with data from any store, or
 * subclass it to bake in a known server's address; the library treats both identically, which is
 * why a curated catalogue and a user-supplied URL are the same code path.
 */
export class AdkMcpServer extends ToolSource {
	private readonly logger = new Logger("Adk:mcp");
	public readonly name: string;
	private client?: Client;
	/** Set when open() was refused because another run holds the connection. */
	private borrowed = false;

	public constructor(protected readonly options: AdkMcpServerOptions) {
		super();
		this.name = options.name;
	}

	/** Stable per connection: two accounts on the same server never collapse into one. */
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
			throw error;
		}

		// One instance serves one run. The runner registers a source for closing before opening it, so
		// without this flag the refused run's close() would tear down the live connection of the run that
		// legitimately holds it, and that run's tools would start answering "not connected" mid-turn.
		if (this.client) {
			this.borrowed = true;
			throw new ToolSourceUnavailableError(this.name, new Error("already open in another run"));
		}

		// The target guard, for the transports that have an address. The check runs here (DNS is
		// asynchronous, createTransport is not) and the guarded fetch rides into the transport, so
		// every request of the connection, redirects included, stays under the same rule.
		const trust: TargetTrust = this.options.allowPrivateNetwork ? "private-ok" : "user";
		let guard: typeof fetch | undefined;
		if (this.options.transport.type !== "stdio") {
			try {
				await assertSafeTarget(this.options.transport.url, trust);
			} catch (error) {
				if (error instanceof McpBlockedTargetError) {
					// error, not warn: a blocked target is someone probing, or a misconfiguration worth a page.
					// Either way the run survives; one integration must not take the conversation down.
					this.logger.error(error.message);
					throw new ToolSourceUnavailableError(this.name, error);
				}
				throw error;
			}
			guard = guardedFetch(trust);
		}

		// Held before connecting: a handshake that fails halfway may already have spawned the child
		// process or opened the socket, and close() is the only thing that will reclaim it.
		const client = new Client({ name: "nestjs-adk", version: "1.0.0" });
		this.client = client;
		try {
			// The signal is honoured as the contract asks: an aborted run must not sit through a handshake
			// with a server nobody is waiting for any more.
			await client.connect(createTransport(this.options.transport, credential, guard), { signal });
			const { tools } = await client.listTools(undefined, { signal });
			return this.toDefinitions(tools);
		} catch (error) {
			// A 401 here means the credential resolved but the server rejected it, same outcome for the
			// user as an expired token, so it must reach `reauth` rather than look like a dead server.
			if (isUnauthorized(error)) throw new ToolSourceAuthError(this.name, "server rejected the credential");
			throw new ToolSourceUnavailableError(this.name, error);
		}
	}

	public async close(_runId?: AgentRunId): Promise<void> {
		// The run that was refused owns nothing: closing here would disconnect somebody else.
		if (this.borrowed) {
			this.borrowed = false;
			return;
		}
		const client = this.client;
		this.client = undefined;
		// Let a failure propagate: the runner logs it, and swallowing it here would hide a child process
		// that refused to exit behind a silence nobody is watching.
		await client?.close();
	}

	private toDefinitions(tools: Awaited<ReturnType<Client["listTools"]>>["tools"]): ToolDefinition[] {
		const wanted = this.options.tools;
		return tools
			.filter((tool) => !wanted || wanted.includes(tool.name))
			.filter((tool) => {
				// The name comes from a server the developer may not control and goes into the declaration
				// the provider receives. A newline or a space breaks the whole request, taking down a run
				// because of one integration; anything stranger is not a name we should be repeating.
				if (SAFE_TOOL_NAME.test(tool.name)) return true;
				this.logger.warn(`ignoring tool with unusable name from server "${this.name}"`);
				return false;
			})
			.map(
				(tool) =>
					new ToolDefinition(
						`${PREFIX}__${this.name}__${tool.name}`,
						tool.description ?? "",
						// The server's schema, as published: the server owns this contract and validates on
						// its side, and the runtime prunes what the provider's declaration cannot carry.
						new JsonSchemaToolSchema(tool.inputSchema ?? { type: "object" }),
						this.effectOf(tool.annotations),
						new McpToolHandler(this, tool.name),
					),
			);
	}

	/**
	 * What a server annotated, unless the application said not to believe it.
	 * A server that will not classify its own tool gets no benefit of the doubt.
	 */
	private effectOf(annotations: Parameters<typeof effectOf>[0]): ToolEffect {
		if (this.options.trustAnnotations === false) return ToolEffect.DESTRUCTIVE;
		return ToolEffect.of(effectOf(annotations)) ?? ToolEffect.DESTRUCTIVE;
	}

	/** A runtime failure goes back TO THE MODEL, which can explain it or try something else. */
	public async callTool(name: string, input: unknown): Promise<unknown> {
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

/**
 * Whether the server refused the credential rather than being unreachable: the difference between
 * showing a reconnect button and telling the user to try later.
 *
 * Read from the SDK's typed errors, never from message text: matching on wording would break the
 * day the SDK rephrases it, and it fails in the worst direction: an expired token would start
 * looking like a dead server, so the reconnect button would silently stop appearing.
 */
function isUnauthorized(error: unknown): boolean {
	if (error instanceof UnauthorizedError) return true;
	if (error instanceof StreamableHTTPError || error instanceof SseError) {
		return error.code === 401 || error.code === 403;
	}
	return false;
}

/**
 * Calls one tool on the server this source is connected to.
 * It holds the source rather than the client because the connection belongs to the run and
 * may already be gone: asking the source keeps the "not connected" answer in one place.
 */
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
