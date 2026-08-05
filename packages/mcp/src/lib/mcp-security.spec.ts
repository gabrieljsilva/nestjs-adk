import { getDefaultEnvironment } from "@modelcontextprotocol/sdk/client/stdio.js";
import { EnvAuth } from "./mcp-auth";
import { McpDiscoveryError, McpOAuth } from "./mcp-oauth";
import { createTransport } from "./mcp-transport";

/** The SDK keeps the spawn options private; this is what would actually reach the child process. */
function envOf(transport: unknown): Record<string, string> | undefined {
	return (transport as { _serverParams?: { env?: Record<string, string> } })._serverParams?.env;
}

describe("stdio: what a local server is allowed to see", () => {
	const original = process.env.PRETEND_SECRET;

	beforeEach(() => {
		process.env.PRETEND_SECRET = "the-llm-api-key";
	});

	afterEach(() => {
		if (original === undefined) delete process.env.PRETEND_SECRET;
		else process.env.PRETEND_SECRET = original;
		vi.unstubAllGlobals();
	});

	it("does not hand the host environment to a server carrying a credential", async () => {
		const credential = await new EnvAuth({ GITHUB_TOKEN: "t" }).resolve();

		const transport = createTransport({ type: "stdio", command: "node", args: [] }, credential);
		const env = envOf(transport) ?? {};

		// EnvAuth is how an end user's own server gets its token: inheriting everything would give that
		// server the LLM provider key and every other tenant's secret along with it
		expect(env.GITHUB_TOKEN).toBe("t");
		expect(env.PRETEND_SECRET).toBeUndefined();
	});

	it("keeps the safe defaults the SDK provides", () => {
		const transport = createTransport({ type: "stdio", command: "node", args: [] });
		const env = envOf(transport) ?? {};

		expect(Object.keys(env)).toEqual(expect.arrayContaining(Object.keys(getDefaultEnvironment())));
		expect(env.PRETEND_SECRET).toBeUndefined();
	});

	it("still lets the developer pass variables of their own", () => {
		const transport = createTransport({ type: "stdio", command: "node", args: [], env: { MY_VAR: "1" } });

		expect(envOf(transport)?.MY_VAR).toBe("1");
	});
});

describe("OAuth discovery against an untrusted server", () => {
	afterEach(() => {
		vi.unstubAllGlobals();
	});

	function respondWith(bodies: Record<string, unknown>) {
		vi.stubGlobal(
			"fetch",
			// Real Response objects: the guarded fetch wraps the call in a Request and reads headers to
			// follow redirects, so a bare `{ ok, status }` literal no longer honours the contract.
			vi.fn(async (input: Request | URL | string) => {
				const key = input instanceof Request ? input.url : String(input);
				const match = Object.keys(bodies).find((path) => key.includes(path));
				if (!match) return new Response(null, { status: 404 });
				return new Response(JSON.stringify(bodies[match]), {
					status: 200,
					headers: { "content-type": "application/json" },
				});
			}),
		);
	}

	it("refuses an authorization server that is not on https", async () => {
		respondWith({ "oauth-protected-resource": { authorization_servers: ["http://auth.example.com"] } });

		// the code and the client secret would travel in the clear
		await expect(McpOAuth.discover("https://203.0.113.10")).rejects.toBeInstanceOf(McpDiscoveryError);
	});

	it("refuses metadata that claims to be a different issuer", async () => {
		respondWith({
			"oauth-protected-resource": { authorization_servers: ["https://auth.example.com"] },
			"oauth-authorization-server": {
				issuer: "https://accounts.google.com",
				authorization_endpoint: "https://auth.example.com/authorize",
				token_endpoint: "https://auth.example.com/token",
			},
		});

		// confused deputy: the user consents on a real provider's screen, the token lands somewhere else
		await expect(McpOAuth.discover("https://203.0.113.10")).rejects.toBeInstanceOf(McpDiscoveryError);
	});

	it("binds the token to the server it was discovered for", async () => {
		respondWith({
			"oauth-protected-resource": { authorization_servers: ["https://auth.example.com"] },
			"oauth-authorization-server": {
				issuer: "https://auth.example.com",
				authorization_endpoint: "https://auth.example.com/authorize",
				token_endpoint: "https://auth.example.com/token",
			},
		});

		const discovery = await McpOAuth.discover("https://203.0.113.10/mcp");
		const { url } = McpOAuth.authorize(
			discovery,
			{ clientId: "c", tokenEndpoint: discovery.tokenEndpoint },
			{
				redirectUri: "https://app.example.com/callback",
			},
		);

		// RFC 8707: without it, a token for this server can be replayed against any other resource
		// trusting the same authorization server
		expect(new URL(url).searchParams.get("resource")).toBe("https://203.0.113.10");
	});

	it("keeps PKCE and state on every authorization", async () => {
		const discovery = {
			issuer: "https://auth.example.com",
			authorizationEndpoint: "https://auth.example.com/authorize",
			tokenEndpoint: "https://auth.example.com/token",
		};

		const first = McpOAuth.authorize(
			discovery,
			{ clientId: "c", tokenEndpoint: discovery.tokenEndpoint },
			{
				redirectUri: "https://app.example.com/callback",
			},
		);
		const second = McpOAuth.authorize(
			discovery,
			{ clientId: "c", tokenEndpoint: discovery.tokenEndpoint },
			{
				redirectUri: "https://app.example.com/callback",
			},
		);

		const params = new URL(first.url).searchParams;
		expect(params.get("code_challenge_method")).toBe("S256");
		expect(params.get("code_challenge")).toBeTruthy();
		// a reused verifier or state would let one flow's code be redeemed by another
		expect(first.verifier).not.toBe(second.verifier);
		expect(first.state).not.toBe(second.state);
		expect(first.url).not.toContain(first.verifier);
	});
});
