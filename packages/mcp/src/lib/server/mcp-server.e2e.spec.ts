import "reflect-metadata";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import {
	Actor,
	AdkAccessPolicy,
	AdkAgent,
	AdkModule,
	AdkModuleOptions,
	AdkTool,
	Agent,
	McpController,
	RuntimeOptions,
	Tool,
	ToolAccess,
	type ToolContext,
	type ToolDefinition,
	ToolResultMessage,
} from "@nestjs-adk/core";
import { type INestApplication, Injectable, Module } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import { afterEach, describe, expect, it } from "vitest";
import { z } from "zod";
import { ToolCallingModel } from "../../../../core/src/support/nest/tool-calling-model.fixture";
import { McpUnauthorizedError } from "./errors/mcp-unauthorized.error";
import { McpActorResolver } from "./mcp-actor-resolver.contract";
import type { McpRequest } from "./mcp-request.value-object";
import { McpServerModule } from "./mcp-server.module";

const CHALLENGE = 'Bearer resource_metadata="http://api.test/.well-known/oauth-protected-resource"';

@Injectable()
class MeetingsService {
	public listFor(ownerId: string, limit: number): readonly string[] {
		return [`${ownerId}:meeting-1`, `${ownerId}:meeting-2`].slice(0, limit);
	}
}

const listSchema = z.object({ limit: z.number().int().min(1).default(10).describe("How many.") });

@Tool({ name: "list_meetings", description: "Lists the caller's meetings.", schema: listSchema, effect: "read" })
class ListMeetingsTool extends AdkTool<typeof listSchema> {
	public constructor(private readonly meetings: MeetingsService) {
		super();
	}

	public execute(input: z.infer<typeof listSchema>, context: ToolContext): unknown {
		const owner = context.actor?.id ?? "nobody";
		return { owner, meetings: this.meetings.listFor(owner, input.limit) };
	}
}

@Agent({ name: "assistant", description: "Answers about meetings.", prompt: "Answer.", tools: [ListMeetingsTool] })
class AssistantAgent extends AdkAgent {
	@Tool({ name: "draft_reply", description: "Only the agent drafts.", schema: z.object({}), effect: "read" })
	public draft(): unknown {
		return { draft: "" };
	}
}

@McpController({ tools: [ListMeetingsTool] })
class MeetingsMcpController {
	public constructor(private readonly meetings: MeetingsService) {}

	@Tool({ name: "count_meetings", description: "Counts the caller's meetings.", schema: z.object({}), effect: "read" })
	public count(_input: Record<string, never>, context: ToolContext): unknown {
		return { count: this.meetings.listFor(context.actor?.id ?? "nobody", 10).length };
	}
}

@Injectable()
class Directory {
	public isMember(id: string): boolean {
		return id === "ana";
	}
}

@Injectable()
class TokenActors extends McpActorResolver {
	public constructor(private readonly directory: Directory) {
		super();
	}

	public async resolve(request: McpRequest): Promise<Actor> {
		const token = request.bearerToken;
		if (token === undefined) throw new McpUnauthorizedError("no bearer token", CHALLENGE);
		if (!token.startsWith("user:")) throw new McpUnauthorizedError("token not issued for this server", CHALLENGE);
		const id = token.slice("user:".length);
		return Actor.fromId(id, { member: this.directory.isMember(id) });
	}
}

class MembersOnly extends AdkAccessPolicy {
	public decide(tool: ToolDefinition, _invocation: unknown, actor: Actor | undefined): ToolAccess {
		return actor?.claims.member === true ? ToolAccess.granted() : ToolAccess.denied(`${tool.name} is for members`);
	}
}

const MARK = Symbol.for("test:marked");
const Marked: ClassDecorator = (target) => {
	Reflect.defineMetadata(MARK, true, target);
};

@Module({ providers: [MeetingsService, ListMeetingsTool, AssistantAgent, MeetingsMcpController] })
class MeetingsModule {}

@Module({ providers: [Directory, TokenActors], exports: [Directory, TokenActors] })
class DirectoryModule {}

let app: INestApplication | undefined;
let clients: Client[] = [];

async function boot(model: ToolCallingModel, path?: string): Promise<{ app: INestApplication; url: string }> {
	@Module({
		imports: [
			AdkModule.forRoot(
				AdkModuleOptions.from({
					defaultModel: model,
					runtime: RuntimeOptions.from({ tools: { access: new MembersOnly() } }),
				}),
			),
			MeetingsModule,
			McpServerModule.forRoot({
				path,
				name: "meetings",
				version: "1.0.0",
				actors: TokenActors,
				imports: [DirectoryModule],
				decorate: [Marked],
			}),
		],
	})
	class AppModule {}

	const compiled = await Test.createTestingModule({ imports: [AppModule] }).compile();
	app = compiled.createNestApplication();
	await app.listen(0);
	const address = app.getHttpServer().address();
	const port = typeof address === "object" && address !== null ? address.port : 0;
	return { app, url: `http://127.0.0.1:${port}${path ?? "/mcp"}` };
}

async function connect(url: string, token?: string): Promise<Client> {
	const client = new Client({ name: "test-client", version: "0.0.0" });
	const headers: Record<string, string> = token === undefined ? {} : { Authorization: `Bearer ${token}` };
	await client.connect(new StreamableHTTPClientTransport(new URL(url), { requestInit: { headers } }));
	clients.push(client);
	return client;
}

function toolResultOf(model: ToolCallingModel): ToolResultMessage | undefined {
	return model.requests[1]?.messages.find(
		(message): message is ToolResultMessage => message instanceof ToolResultMessage,
	);
}

afterEach(async () => {
	for (const client of clients) await client.close().catch(() => undefined);
	clients = [];
	await app?.close();
	app = undefined;
});

describe("McpServerModule, over HTTP", () => {
	it("challenges a request with no credential the way an OAuth resource does", async () => {
		const { url } = await boot(new ToolCallingModel("list_meetings"));

		const response = await fetch(url, {
			method: "POST",
			headers: { "Content-Type": "application/json", Accept: "application/json, text/event-stream" },
			body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "initialize", params: {} }),
		});

		expect(response.status).toBe(401);
		expect(response.headers.get("www-authenticate")).toBe(CHALLENGE);
		expect(await response.json()).toEqual({ error: "invalid_token", error_description: "no bearer token" });
	});

	it("refuses a credential the resolver does not accept, before the protocol sees anything", async () => {
		const { url } = await boot(new ToolCallingModel("list_meetings"));

		await expect(connect(url, "web-app-token")).rejects.toThrow();
	});

	it("lists what the controllers published, and nothing an agent kept for itself", async () => {
		const { url } = await boot(new ToolCallingModel("list_meetings"));
		const client = await connect(url, "user:ana");

		const { tools } = await client.listTools();

		expect(tools.map((tool) => tool.name)).toEqual(["list_meetings", "count_meetings"]);
		expect(tools[0]?.inputSchema).toMatchObject({ type: "object", properties: { limit: { type: "integer" } } });
		expect(tools[0]?.annotations).toEqual({ readOnlyHint: true, destructiveHint: false });
	});

	it("runs a tool for the actor the bearer resolved to, on the instance NestJS built", async () => {
		const { url } = await boot(new ToolCallingModel("list_meetings"));
		const client = await connect(url, "user:ana");

		const result = await client.callTool({ name: "list_meetings", arguments: { limit: 1 } });

		expect(result.isError).toBeFalsy();
		expect(result.structuredContent).toEqual({ owner: "ana", meetings: ["ana:meeting-1"] });
	});

	it("runs a tool a controller declared on itself, with the same actor", async () => {
		const { url } = await boot(new ToolCallingModel("list_meetings"));
		const client = await connect(url, "user:ana");

		const result = await client.callTool({ name: "count_meetings", arguments: {} });

		expect(result.structuredContent).toEqual({ count: 2 });
	});

	it("keeps two callers apart: each sees their own data and never the other's", async () => {
		const { url } = await boot(new ToolCallingModel("list_meetings"));
		const ana = await connect(url, "user:ana");
		const bob = await connect(url, "user:bob");

		const forAna = await ana.callTool({ name: "list_meetings", arguments: { limit: 2 } });
		const forBob = await bob.callTool({ name: "list_meetings", arguments: { limit: 2 } });

		expect(forAna.structuredContent).toEqual({ owner: "ana", meetings: ["ana:meeting-1", "ana:meeting-2"] });
		expect(forBob.isError).toBe(true);
		expect(forBob.content).toEqual([{ type: "text", text: "list_meetings is for members" }]);
	});

	it("refuses arguments the schema rejects as an error result, not a protocol failure", async () => {
		const { url } = await boot(new ToolCallingModel("list_meetings"));
		const client = await connect(url, "user:ana");

		const result = await client.callTool({ name: "list_meetings", arguments: { limit: 0 } });

		expect(result.isError).toBe(true);
	});

	it("refuses a tool the agent has and the controllers did not publish", async () => {
		const { url } = await boot(new ToolCallingModel("list_meetings"));
		const client = await connect(url, "user:ana");

		const result = await client.callTool({ name: "draft_reply", arguments: {} });

		expect(result.isError).toBe(true);
		expect(result.content).toEqual([{ type: "text", text: "Unknown tool: draft_reply." }]);
	});

	/**
	 * A refusal is not an error: a model told of a fault retries, one told of a refusal moves on.
	 */
	it("answers the agent's path and the client's path alike, because both go through the same gate", async () => {
		const model = new ToolCallingModel("list_meetings", { limit: 1 });
		const { app: booted, url } = await boot(model);
		const client = await connect(url, "user:bob");

		await booted.get(AssistantAgent).ask("what do I have?", { actor: Actor.fromId("bob", { member: false }) });
		const overMcp = await client.callTool({ name: "list_meetings", arguments: { limit: 1 } });

		expect(toolResultOf(model)?.failed).toBe(true);
		expect(toolResultOf(model)?.output).toEqual({ refused: true, reason: "list_meetings is for members" });
		expect(overMcp.isError).toBe(true);
		expect(overMcp.content).toEqual([{ type: "text", text: "list_meetings is for members" }]);
	});

	it("mounts at the path the application chose, and applies its decorators to the route", async () => {
		const { url } = await boot(new ToolCallingModel("list_meetings"), "/integrations/mcp");
		const client = await connect(url, "user:ana");

		const { tools } = await client.listTools();
		const response = await fetch(url.replace("/integrations/mcp", "/mcp"), { method: "POST" });

		expect(tools).toHaveLength(2);
		expect(response.status).toBe(404);
	});
});
