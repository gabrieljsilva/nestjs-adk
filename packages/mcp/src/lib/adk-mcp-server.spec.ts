import { UnauthorizedError } from "@modelcontextprotocol/sdk/client/auth.js";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { SseError } from "@modelcontextprotocol/sdk/client/sse.js";
import { StreamableHTTPError } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { AgentRunId, SessionId, ToolSourceAuthError, ToolSourceUnavailableError } from "@nestjs-adk/core/native";
import { AdkMcpServer } from "./adk-mcp-server";
import { AdkMcpAuth, BearerAuth, McpReauthRequiredError, credentialDigest } from "./mcp-auth";

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
