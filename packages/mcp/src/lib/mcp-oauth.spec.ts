import { McpDiscoveryError, McpOAuth } from "./mcp-oauth";

/**
 * Every route the flow can take, answered by exact URL. Discovery walks several candidates in order,
 * so a matcher that answers by substring would hide which one actually served the document, which is
 * the whole subject of these tests.
 */
function routes(handlers: Record<string, { status?: number; body?: unknown; text?: string; type?: string }>) {
	const seen: string[] = [];
	vi.stubGlobal(
		"fetch",
		vi.fn(async (input: Request | URL | string, init?: RequestInit) => {
			const url = input instanceof Request ? input.url : String(input);
			seen.push(url);
			const handler = handlers[url];
			if (!handler) return new Response("not found", { status: 404 });
			const type = handler.type ?? "application/json";
			const body = handler.text ?? (handler.body === undefined ? null : JSON.stringify(handler.body));
			return new Response(body, { status: handler.status ?? 200, headers: { "content-type": type } });
		}),
	);
	// The guarded fetch normalizes everything into a Request before calling through, so the headers a
	// provider actually receives are on that object, never on the init literal the caller wrote.
	const lastHeaders = () => {
		const [input, init] = vi.mocked(fetch).mock.calls.at(-1) ?? [];
		if (input instanceof Request) return input.headers;
		return new Headers((init as RequestInit | undefined)?.headers);
	};
	return { seen, lastHeaders };
}

const AS_METADATA = {
	issuer: "https://auth.example.com",
	authorization_endpoint: "https://auth.example.com/authorize",
	token_endpoint: "https://auth.example.com/token",
};

describe("discovery: where the well-known documents actually live", () => {
	afterEach(() => {
		vi.unstubAllGlobals();
	});

	it("finds the protected resource document under the server's path", async () => {
		// RFC 9728: the path of the resource is INSERTED after the well-known segment. A server mounted
		// on /mcp publishes at /.well-known/oauth-protected-resource/mcp and answers 404 at the root,
		// which is how GitHub's MCP server looked like a server with no authorization at all.
		routes({
			"https://api.example.com/.well-known/oauth-protected-resource/mcp": {
				body: { authorization_servers: ["https://auth.example.com"] },
			},
			"https://auth.example.com/.well-known/oauth-authorization-server": { body: AS_METADATA },
		});

		const discovery = await McpOAuth.discover("https://api.example.com/mcp/");

		expect(discovery.tokenEndpoint).toBe("https://auth.example.com/token");
	});

	it("still finds it at the root, where a server mounted on / publishes", async () => {
		routes({
			"https://api.example.com/.well-known/oauth-protected-resource": {
				body: { authorization_servers: ["https://auth.example.com"] },
			},
			"https://auth.example.com/.well-known/oauth-authorization-server": { body: AS_METADATA },
		});

		const discovery = await McpOAuth.discover("https://api.example.com");

		expect(discovery.tokenEndpoint).toBe("https://auth.example.com/token");
	});

	it("finds the authorization server metadata under the issuer's path", async () => {
		// RFC 8414 §3.1, the same insertion rule: an issuer of https://github.com/login/oauth publishes
		// at https://github.com/.well-known/oauth-authorization-server/login/oauth.
		routes({
			"https://api.example.com/.well-known/oauth-protected-resource/mcp": {
				body: { authorization_servers: ["https://auth.example.com/login/oauth"] },
			},
			"https://auth.example.com/.well-known/oauth-authorization-server/login/oauth": {
				body: {
					issuer: "https://auth.example.com/login/oauth",
					authorization_endpoint: "https://auth.example.com/login/oauth/authorize",
					token_endpoint: "https://auth.example.com/login/oauth/access_token",
				},
			},
		});

		const discovery = await McpOAuth.discover("https://api.example.com/mcp");

		expect(discovery.issuer).toBe("https://auth.example.com/login/oauth");
		expect(discovery.tokenEndpoint).toBe("https://auth.example.com/login/oauth/access_token");
	});

	it("accepts an OpenID Connect provider, which publishes the same fields elsewhere", async () => {
		routes({
			"https://api.example.com/.well-known/oauth-protected-resource": {
				body: { authorization_servers: ["https://auth.example.com"] },
			},
			"https://auth.example.com/.well-known/openid-configuration": { body: AS_METADATA },
		});

		const discovery = await McpOAuth.discover("https://api.example.com");

		expect(discovery.tokenEndpoint).toBe("https://auth.example.com/token");
	});

	it("asks the path-inserted location before the root, so a shared host answers for the right issuer", async () => {
		const { seen } = routes({
			"https://api.example.com/.well-known/oauth-protected-resource/mcp": {
				body: { authorization_servers: ["https://auth.example.com/tenant-a"] },
			},
			"https://auth.example.com/.well-known/oauth-authorization-server/tenant-a": {
				body: {
					issuer: "https://auth.example.com/tenant-a",
					authorization_endpoint: "https://auth.example.com/tenant-a/authorize",
					token_endpoint: "https://auth.example.com/tenant-a/token",
				},
			},
			"https://auth.example.com/.well-known/oauth-authorization-server": {
				body: {
					issuer: "https://auth.example.com",
					authorization_endpoint: "https://auth.example.com/authorize",
					token_endpoint: "https://auth.example.com/token",
				},
			},
		});

		const discovery = await McpOAuth.discover("https://api.example.com/mcp");

		expect(discovery.tokenEndpoint).toBe("https://auth.example.com/tenant-a/token");
		expect(seen.indexOf("https://auth.example.com/.well-known/oauth-authorization-server/tenant-a")).toBeLessThan(
			seen.indexOf("https://auth.example.com/.well-known/oauth-authorization-server") === -1
				? Number.POSITIVE_INFINITY
				: seen.indexOf("https://auth.example.com/.well-known/oauth-authorization-server"),
		);
	});

	it("reports a server that publishes nothing anywhere", async () => {
		routes({
			"https://api.example.com/.well-known/oauth-protected-resource/mcp": {
				body: { authorization_servers: ["https://auth.example.com"] },
			},
		});

		await expect(McpOAuth.discover("https://api.example.com/mcp")).rejects.toBeInstanceOf(McpDiscoveryError);
	});

	it("finds an OpenID Connect provider mounted on a path, which APPENDS instead of inserting", async () => {
		// OIDC Discovery is the one dialect where the document lives at
		// {issuer}/.well-known/openid-configuration, not under the root's well-known segment.
		routes({
			"https://api.example.com/.well-known/oauth-protected-resource": {
				body: { authorization_servers: ["https://auth.example.com/realms/acme"] },
			},
			"https://auth.example.com/realms/acme/.well-known/openid-configuration": {
				body: {
					issuer: "https://auth.example.com/realms/acme",
					authorization_endpoint: "https://auth.example.com/realms/acme/authorize",
					token_endpoint: "https://auth.example.com/realms/acme/token",
				},
			},
		});

		const discovery = await McpOAuth.discover("https://api.example.com");

		expect(discovery.tokenEndpoint).toBe("https://auth.example.com/realms/acme/token");
	});

	it("refuses an issuer that agrees on the origin but not on the path", async () => {
		// A shared host separates tenants by path alone: comparing origins would accept any of them,
		// which is the confused-deputy the issuer check exists to stop.
		routes({
			"https://api.example.com/.well-known/oauth-protected-resource/mcp": {
				body: { authorization_servers: ["https://auth.example.com/tenant-a"] },
			},
			"https://auth.example.com/.well-known/oauth-authorization-server/tenant-a": {
				body: {
					issuer: "https://auth.example.com/tenant-b",
					authorization_endpoint: "https://auth.example.com/tenant-b/authorize",
					token_endpoint: "https://auth.example.com/tenant-b/token",
				},
			},
		});

		await expect(McpOAuth.discover("https://api.example.com/mcp")).rejects.toThrow(/tenant-b/);
	});

	it("does not fail the issuer check over a trailing slash", async () => {
		routes({
			"https://api.example.com/.well-known/oauth-protected-resource/mcp": {
				body: { authorization_servers: ["https://auth.example.com/login"] },
			},
			"https://auth.example.com/.well-known/oauth-authorization-server/login": {
				body: {
					issuer: "https://auth.example.com/login/",
					authorization_endpoint: "https://auth.example.com/login/authorize",
					token_endpoint: "https://auth.example.com/login/token",
				},
			},
		});

		const discovery = await McpOAuth.discover("https://api.example.com/mcp");

		expect(discovery.tokenEndpoint).toBe("https://auth.example.com/login/token");
	});

	it("keeps refusing an issuer that contradicts the document, path or no path", async () => {
		routes({
			"https://api.example.com/.well-known/oauth-protected-resource/mcp": {
				body: { authorization_servers: ["https://auth.example.com/login"] },
			},
			"https://auth.example.com/.well-known/oauth-authorization-server/login": {
				body: { ...AS_METADATA, issuer: "https://accounts.google.com" },
			},
		});

		await expect(McpOAuth.discover("https://api.example.com/mcp")).rejects.toBeInstanceOf(McpDiscoveryError);
	});
});

describe("registration: what the server said when it refused", () => {
	afterEach(() => {
		vi.unstubAllGlobals();
	});

	const discovery = {
		issuer: "https://auth.example.com",
		authorizationEndpoint: "https://auth.example.com/authorize",
		tokenEndpoint: "https://auth.example.com/token",
		registrationEndpoint: "https://auth.example.com/register",
	};

	it("carries the provider's own explanation, not just the status", async () => {
		// A bare "registration failed with 400" sends the operator to read our code, when the answer was
		// in the body all along: ClickUp, for one, replies that the integration is not allowlisted.
		routes({
			"https://auth.example.com/register": {
				status: 400,
				body: { error: "invalid_request", error_description: "Your integration is not currently allowlisted." },
			},
		});

		await expect(
			McpOAuth.register(discovery, { redirectUri: "https://app.example.com/cb", clientName: "app" }),
		).rejects.toThrow(/not currently allowlisted/);
	});

	it("falls back to the status when the body explains nothing", async () => {
		routes({ "https://auth.example.com/register": { status: 500, text: "<html>oops</html>", type: "text/html" } });

		await expect(
			McpOAuth.register(discovery, { redirectUri: "https://app.example.com/cb", clientName: "app" }),
		).rejects.toThrow(/500/);
	});
});

describe("token exchange: how providers actually answer", () => {
	afterEach(() => {
		vi.unstubAllGlobals();
	});

	const client = { clientId: "c", tokenEndpoint: "https://auth.example.com/token" };
	const options = { code: "abc", verifier: "v", redirectUri: "https://app.example.com/cb" };

	it("reads a form-encoded token response", async () => {
		// GitHub answers application/x-www-form-urlencoded, and JSON.parse on "access_token=..." threw
		// a syntax error that read like a broken server instead of a working one in another dialect.
		routes({
			"https://auth.example.com/token": {
				text: "access_token=gho_1&token_type=bearer&scope=repo&expires_in=28800",
				type: "application/x-www-form-urlencoded",
			},
		});

		const tokens = await McpOAuth.exchange(client, options);

		expect(tokens.accessToken).toBe("gho_1");
		expect(tokens.expiresAt).toBeInstanceOf(Date);
	});

	it("asks for JSON, which is what makes most providers answer in JSON", async () => {
		const { lastHeaders } = routes({
			"https://auth.example.com/token": { body: { access_token: "t" } },
		});

		await McpOAuth.exchange(client, options);

		expect(lastHeaders().get("accept")).toBe("application/json");
	});

	it("still reads a JSON response", async () => {
		routes({
			"https://auth.example.com/token": { body: { access_token: "t", refresh_token: "r", expires_in: 60 } },
		});

		const tokens = await McpOAuth.exchange(client, options);

		expect(tokens.accessToken).toBe("t");
		expect(tokens.refreshToken).toBe("r");
	});

	it("reports the provider's error instead of a parse failure", async () => {
		routes({
			"https://auth.example.com/token": {
				text: "error=bad_verification_code&error_description=The+code+expired",
				type: "application/x-www-form-urlencoded",
			},
		});

		// A 200 carrying an OAuth error is legal, and the operator needs the reason, not "no access token"
		await expect(McpOAuth.exchange(client, options)).rejects.toThrow(/code expired/i);
	});
});
