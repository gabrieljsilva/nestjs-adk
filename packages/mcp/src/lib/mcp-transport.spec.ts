import { AdkMcpServer } from "./adk-mcp-server";
import { AdkMcpAuth, BearerAuth, EnvAuth, credentialDigest } from "./mcp-auth";
import { createTransport } from "./mcp-transport";

/** The SDK transports keep their options private; the request init is what actually reaches the server. */
function headersOf(transport: unknown): Record<string, string> {
	const init = (transport as { _requestInit?: { headers?: Record<string, string> } })._requestInit;
	return init?.headers ?? {};
}

describe("createTransport", () => {
	it("carries the credential as headers over HTTP", () => {
		const transport = createTransport(
			{ type: "http", url: "https://203.0.113.10" },
			{ headers: { Authorization: "Bearer t" } },
		);

		expect(headersOf(transport)).toMatchObject({ Authorization: "Bearer t" });
	});

	it("carries the credential as headers over SSE", () => {
		const transport = createTransport(
			{ type: "sse", url: "https://203.0.113.10/sse" },
			{ headers: { "X-Api-Key": "k" } },
		);

		expect(headersOf(transport)).toMatchObject({ "X-Api-Key": "k" });
	});

	it("lets the credential win over a statically configured header", () => {
		const transport = createTransport(
			{ type: "http", url: "https://203.0.113.10", headers: { Authorization: "Bearer stale" } },
			{ headers: { Authorization: "Bearer fresh" } },
		);

		// the renewed token is the one that just came out of the auth provider
		expect(headersOf(transport)).toMatchObject({ Authorization: "Bearer fresh" });
	});

	it("builds an HTTP transport without a credential at all", () => {
		const transport = createTransport({ type: "http", url: "https://203.0.113.10" });

		expect(headersOf(transport)).toEqual({});
	});
});

describe("connection identity", () => {
	const transport = { type: "http", url: "https://mcp.clickup.com/mcp" } as const;

	it("uses the id the application supplied", () => {
		const server = new AdkMcpServer({ id: "row-42", name: "clickup", transport, auth: new BearerAuth("t") });

		expect(server.id).toBe("row-42");
	});

	it("keeps two accounts on the same server apart", () => {
		const personal = new AdkMcpServer({ name: "clickup-pessoal", transport, auth: new BearerAuth("token-a") });
		const company = new AdkMcpServer({ name: "clickup-empresa", transport, auth: new BearerAuth("token-b") });

		// same URL, different people: collapsing these would run one user's tools with another's credential
		expect(personal.id).not.toBe(company.id);
	});

	it("treats the same credential on the same server as the same connection", () => {
		const first = new AdkMcpServer({ name: "a", transport, auth: new BearerAuth("token") });
		const second = new AdkMcpServer({ name: "b", transport, auth: new BearerAuth("token") });

		expect(first.id).toBe(second.id);
	});

	it("never puts the credential itself in the id", () => {
		const server = new AdkMcpServer({ name: "clickup", transport, auth: new BearerAuth("super-secret-token") });

		// the id reaches logs and metrics; a token in it would leak with them
		expect(server.id).not.toContain("super-secret-token");
	});

	it("separates an anonymous connection from an authenticated one", () => {
		const anonymous = new AdkMcpServer({ name: "a", transport });
		const authenticated = new AdkMcpServer({ name: "b", transport, auth: new BearerAuth("t") });

		expect(anonymous.id).not.toBe(authenticated.id);
	});

	it("keeps a custom auth's connections apart even with real private fields", () => {
		class VaultAuth extends AdkMcpAuth {
			readonly #token: string;

			constructor(token: string) {
				super();
				this.#token = token;
			}

			resolve() {
				return Promise.resolve({ headers: { Authorization: `Bearer ${this.#token}` } });
			}

			fingerprint() {
				return credentialDigest("vault", this.#token);
			}
		}

		const mine = new AdkMcpServer({ name: "a", transport, auth: new VaultAuth("token-a") });
		const yours = new AdkMcpServer({ name: "b", transport, auth: new VaultAuth("token-b") });

		// `#private` is invisible to JSON.stringify: deriving the id by serialization would have made
		// these identical, and one user would have run tools with the other's credential
		expect(mine.id).not.toBe(yours.id);
	});

	it("distinguishes local servers by command and credential", () => {
		const stdio = { type: "stdio", command: "npx", args: ["-y", "server-github"] } as const;
		const mine = new AdkMcpServer({ name: "gh-a", transport: stdio, auth: new EnvAuth({ GITHUB_TOKEN: "a" }) });
		const yours = new AdkMcpServer({ name: "gh-b", transport: stdio, auth: new EnvAuth({ GITHUB_TOKEN: "b" }) });

		expect(mine.id).not.toBe(yours.id);
	});
});
