import { UnauthorizedError } from "@modelcontextprotocol/sdk/client/auth.js";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { SseError } from "@modelcontextprotocol/sdk/client/sse.js";
import { StreamableHTTPError } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { AgentRunId, SessionId, ToolSourceAuthError, ToolSourceUnavailableError } from "@nestjs-adk/core";
import { AdkMcpServer } from "./adk-mcp-server.adapter";
import { McpInvalidSourceNameError } from "./errors/mcp-invalid-source-name.error";
import { McpReauthRequiredError } from "./errors/mcp-reauth-required.error";
import { AdkMcpAuth, BearerAuth, credentialDigest } from "./mcp-auth.service";

const SESSION = SessionId.from("s-1");
const RUN = AgentRunId.from("r-1");
const SIGNAL = new AbortController().signal;

function serverWith(connectError: unknown): AdkMcpServer {
	vi.spyOn(Client.prototype, "connect").mockRejectedValue(connectError);
	return new AdkMcpServer({
		name: "clickup",
		transport: { type: "http", url: "https://203.0.113.10" },
		auth: new BearerAuth("t"),
	});
}

describe("AdkMcpServer: how a failed connection is classified", () => {
	afterEach(() => {
		vi.restoreAllMocks();
	});

	it("turns a refused credential into a request to re-authorize", async () => {
		const server = serverWith(new UnauthorizedError("token rejected"));

		// telling the user "try later" here would hide the reconnect button they actually need
		await expect(server.open(SESSION, RUN, SIGNAL)).rejects.toBeInstanceOf(ToolSourceAuthError);
	});

	it("treats an HTTP 401 the same way", async () => {
		const server = serverWith(new StreamableHTTPError(401, "unauthorized"));

		await expect(server.open(SESSION, RUN, SIGNAL)).rejects.toBeInstanceOf(ToolSourceAuthError);
	});

	it("treats an SSE 403 the same way", async () => {
		// The SDK's constructor demands the ErrorEvent it wraps; isUnauthorized only reads `code`.
		const server = serverWith(new SseError(403, "forbidden", undefined as never));

		await expect(server.open(SESSION, RUN, SIGNAL)).rejects.toBeInstanceOf(ToolSourceAuthError);
	});

	it("keeps a server that is merely down out of the re-authorize bucket", async () => {
		const server = serverWith(new StreamableHTTPError(503, "service unavailable"));

		// reconnecting the account would not fix this, so it must not ask the user to
		await expect(server.open(SESSION, RUN, SIGNAL)).rejects.toBeInstanceOf(ToolSourceUnavailableError);
	});

	it("does not read the classification out of the error message", async () => {
		const server = serverWith(new Error("request failed: 401 unauthorized"));

		// matching on wording would break the day the SDK rephrases it, and silently stop asking to reconnect
		await expect(server.open(SESSION, RUN, SIGNAL)).rejects.toBeInstanceOf(ToolSourceUnavailableError);
	});

	it("reports a credential that could not even be resolved as needing re-authorization", async () => {
		class ExpiredAuth extends AdkMcpAuth {
			resolve(): Promise<never> {
				return Promise.reject(new McpReauthRequiredError("refresh token revoked"));
			}
			fingerprint() {
				return credentialDigest("expired");
			}
		}
		const server = new AdkMcpServer({
			name: "clickup",
			transport: { type: "http", url: "https://203.0.113.10" },
			auth: new ExpiredAuth(),
		});

		await expect(server.open(SESSION, RUN, SIGNAL)).rejects.toBeInstanceOf(ToolSourceAuthError);
	});

	it("still closes after a failed handshake", async () => {
		const close = vi.spyOn(Client.prototype, "close").mockResolvedValue(undefined);
		const server = serverWith(new StreamableHTTPError(503, "down"));

		await expect(server.open(SESSION, RUN, SIGNAL)).rejects.toThrow();
		await server.close();

		// the handshake may already have opened a socket or spawned a process before failing
		expect(close).toHaveBeenCalledTimes(1);
	});

	it("refuses to open the same instance twice at once", async () => {
		vi.spyOn(Client.prototype, "connect").mockResolvedValue(undefined);
		vi.spyOn(Client.prototype, "listTools").mockResolvedValue({ tools: [] });
		const server = new AdkMcpServer({ name: "a", transport: { type: "http", url: "https://203.0.113.10" } });

		await server.open(SESSION, RUN, SIGNAL);

		// a shared instance across concurrent runs would have the second open orphan the first client
		await expect(server.open(SESSION, RUN, SIGNAL)).rejects.toBeInstanceOf(ToolSourceUnavailableError);
	});
});

describe("AdkMcpServer: which tools of the catalog reach the model and the network", () => {
	const CATALOG = [
		{ name: "create_issue", inputSchema: { type: "object" } as const },
		{ name: "delete_repo", inputSchema: { type: "object" } as const },
	];

	function connected(options: Partial<ConstructorParameters<typeof AdkMcpServer>[0]> = {}): AdkMcpServer {
		vi.spyOn(Client.prototype, "connect").mockResolvedValue(undefined);
		vi.spyOn(Client.prototype, "listTools").mockResolvedValue({ tools: CATALOG });
		return new AdkMcpServer({
			name: "github",
			transport: { type: "http", url: "https://203.0.113.10" },
			...options,
		});
	}

	afterEach(() => {
		vi.restoreAllMocks();
	});

	it("declares only the tools the allow list names", async () => {
		const server = connected({ tools: ["create_issue"] });

		const definitions = await server.open(SESSION, RUN, SIGNAL);

		expect(definitions.map((definition) => definition.name)).toEqual(["mcp__github__create_issue"]);
	});

	it("does not run a tool it left out, even called by name", async () => {
		const call = vi.spyOn(Client.prototype, "callTool").mockResolvedValue({ content: [] });
		const server = connected({ tools: ["create_issue"] });
		await server.open(SESSION, RUN, SIGNAL);

		const result = await server.callTool("delete_repo", {});

		// a hidden tool is still callable by a model that invented the name or a server that suggested it
		expect(call).not.toHaveBeenCalled();
		expect(result).toEqual({ error: 'MCP tool "delete_repo" is not available on server "github".' });
	});

	it("keeps a denied tool out of the declaration and off the network", async () => {
		const call = vi.spyOn(Client.prototype, "callTool").mockResolvedValue({ content: [] });
		const server = connected({ excludeTools: ["delete_repo"] });

		const definitions = await server.open(SESSION, RUN, SIGNAL);
		await server.callTool("delete_repo", {});

		expect(definitions.map((definition) => definition.name)).toEqual(["mcp__github__create_issue"]);
		expect(call).not.toHaveBeenCalled();
	});

	it("lets the deny list win over the allow list", async () => {
		const call = vi.spyOn(Client.prototype, "callTool").mockResolvedValue({ content: [] });
		const server = connected({ tools: ["create_issue", "delete_repo"], excludeTools: ["delete_repo"] });

		const definitions = await server.open(SESSION, RUN, SIGNAL);
		await server.callTool("delete_repo", {});

		expect(definitions.map((definition) => definition.name)).toEqual(["mcp__github__create_issue"]);
		expect(call).not.toHaveBeenCalled();
	});

	it("refuses a call before it knows whether it is connected", async () => {
		const server = connected({ tools: ["create_issue"] });

		// the answer must not depend on the connection: a refusal that only happens while open would let
		// the same call through on the run that reconnects
		await expect(server.callTool("delete_repo", {})).resolves.toEqual({
			error: 'MCP tool "delete_repo" is not available on server "github".',
		});
	});

	it("still calls a tool it admits", async () => {
		const call = vi.spyOn(Client.prototype, "callTool").mockResolvedValue({ content: [{ type: "text", text: "ok" }] });
		const server = connected({ tools: ["create_issue"] });
		await server.open(SESSION, RUN, SIGNAL);

		await expect(server.callTool("create_issue", {})).resolves.toBe("ok");
		expect(call).toHaveBeenCalledTimes(1);
	});

	it("gives two installations of one integration two sets of names", async () => {
		const first = await connected({ name: "github-7" }).open(SESSION, RUN, SIGNAL);
		vi.restoreAllMocks();
		const second = await connected({ name: "github-9" }).open(SESSION, RUN, SIGNAL);

		expect(first.map((definition) => definition.name)).toEqual([
			"mcp__github-7__create_issue",
			"mcp__github-7__delete_repo",
		]);
		expect(second.map((definition) => definition.name)).toEqual([
			"mcp__github-9__create_issue",
			"mcp__github-9__delete_repo",
		]);
	});

	it("refuses a source name that cannot become a tool name, before any connection", () => {
		expect(() => new AdkMcpServer({ name: "git hub", transport: { type: "http", url: "https://203.0.113.10" } })).toThrow(
			McpInvalidSourceNameError,
		);
	});
});
