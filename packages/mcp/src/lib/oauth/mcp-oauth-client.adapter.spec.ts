import { McpBlockedTargetError } from "../errors/mcp-blocked-target.error";
import { McpDiscoveryError } from "../errors/mcp-discovery.error";
import { McpOAuthClient } from "./mcp-oauth-client.adapter";

function routes(handlers: Record<string, { status?: number; body?: unknown }>) {
	const calls: Array<{ url: string; init?: RequestInit }> = [];
	const call = vi.fn(async (input: Request | URL | string, init?: RequestInit) => {
		const url = input instanceof Request ? input.url : String(input);
		calls.push({ url, init });
		const handler = handlers[url];
		if (!handler) return new Response("not found", { status: 404 });
		return new Response(handler.body === undefined ? null : JSON.stringify(handler.body), {
			status: handler.status ?? 200,
			headers: { "content-type": "application/json" },
		});
	});
	return { call, calls, bodyOf: (url: string) => JSON.parse(String(calls.find((one) => one.url === url)?.init?.body)) };
}

const DISCOVERY = {
	issuer: "https://auth.example.com",
	authorizationEndpoint: "https://auth.example.com/authorize",
	tokenEndpoint: "https://auth.example.com/token",
	registrationEndpoint: "https://auth.example.com/register",
};

describe("registration", () => {
	it("keeps what RFC 7592 returns to manage the registration with", async () => {
		// Without these, a registration this package created can never be deleted, and the secret
		// lapses with the first sign being every renewal failing at once months later.
		const { call } = routes({
			"https://auth.example.com/register": {
				body: {
					client_id: "c",
					client_secret: "s",
					client_secret_expires_at: 1800000000,
					registration_access_token: "rat",
					registration_client_uri: "https://auth.example.com/register/c",
				},
			},
		});

		const client = await new McpOAuthClient({ fetch: call }).register(DISCOVERY, {
			redirectUri: "https://app.example.com/cb",
			clientName: "app",
		});

		expect(client.registrationAccessToken).toBe("rat");
		expect(client.registrationClientUri).toBe("https://auth.example.com/register/c");
		expect(client.secretExpiresAt).toEqual(new Date(1800000000 * 1000));
	});

	it("reads a secret that never expires as no expiry at all", async () => {
		// RFC 7591 §3.2.1 spells "never" as zero, and a date built from it is 1970.
		const { call } = routes({
			"https://auth.example.com/register": { body: { client_id: "c", client_secret: "s", client_secret_expires_at: 0 } },
		});

		const client = await new McpOAuthClient({ fetch: call }).register(DISCOVERY, {
			redirectUri: "https://app.example.com/cb",
			clientName: "app",
		});

		expect(client.secretExpiresAt).toBeUndefined();
	});

	it("asks for an authentication method the server announced", async () => {
		const { call, bodyOf } = routes({
			"https://auth.example.com/register": { body: { client_id: "c", client_secret: "s" } },
		});

		const client = await new McpOAuthClient({ fetch: call }).register(
			{ ...DISCOVERY, tokenEndpointAuthMethodsSupported: ["client_secret_basic", "private_key_jwt"] },
			{ redirectUri: "https://app.example.com/cb", clientName: "app" },
		);

		expect(bodyOf("https://auth.example.com/register").token_endpoint_auth_method).toBe("client_secret_basic");
		// Carried on the client, because it is the token endpoint that has to use the same one.
		expect(client.authMethod).toBe("client_secret_basic");
	});

	it("keeps the method the server settled on when it is not the one asked for", async () => {
		const { call } = routes({
			"https://auth.example.com/register": {
				body: { client_id: "c", client_secret: "s", token_endpoint_auth_method: "client_secret_basic" },
			},
		});

		const client = await new McpOAuthClient({ fetch: call }).register(DISCOVERY, {
			redirectUri: "https://app.example.com/cb",
			clientName: "app",
		});

		expect(client.authMethod).toBe("client_secret_basic");
	});

	it("says so when the server accepts no method this client can speak", async () => {
		const { call } = routes({});

		await expect(
			new McpOAuthClient({ fetch: call }).register(
				{ ...DISCOVERY, tokenEndpointAuthMethodsSupported: ["private_key_jwt"] },
				{ redirectUri: "https://app.example.com/cb", clientName: "app" },
			),
		).rejects.toThrow(/private_key_jwt/);
	});

	it("does not ask for a grant the server does not support", async () => {
		// Asking for refresh_token where it is not offered is how a whole registration gets refused.
		const { call, bodyOf } = routes({
			"https://auth.example.com/register": { body: { client_id: "c" } },
		});

		await new McpOAuthClient({ fetch: call }).register(
			{ ...DISCOVERY, grantTypesSupported: ["authorization_code"] },
			{ redirectUri: "https://app.example.com/cb", clientName: "app" },
		);

		expect(bodyOf("https://auth.example.com/register").grant_types).toEqual(["authorization_code"]);
	});

	it("carries the extra metadata a provider asks for", async () => {
		const { call, bodyOf } = routes({
			"https://auth.example.com/register": { body: { client_id: "c" } },
		});

		await new McpOAuthClient({ fetch: call, clientMetadata: { logo_uri: "https://app.example.com/logo.png" } }).register(
			DISCOVERY,
			{ redirectUri: "https://app.example.com/cb", clientName: "app" },
		);

		expect(bodyOf("https://auth.example.com/register").logo_uri).toBe("https://app.example.com/logo.png");
	});
});

describe("deleting a registration", () => {
	it("deletes it with the credentials the registration returned", async () => {
		const { call, calls } = routes({ "https://auth.example.com/register/c": { status: 204 } });

		const deleted = await new McpOAuthClient({ fetch: call }).unregister({
			clientId: "c",
			tokenEndpoint: DISCOVERY.tokenEndpoint,
			registrationAccessToken: "rat",
			registrationClientUri: "https://auth.example.com/register/c",
		});

		expect(deleted).toBe(true);
		expect(calls.at(-1)?.init?.method).toBe("DELETE");
	});

	it("answers no when the provider returned nothing to delete it with", async () => {
		const { call } = routes({});

		const deleted = await new McpOAuthClient({ fetch: call }).unregister({
			clientId: "c",
			tokenEndpoint: DISCOVERY.tokenEndpoint,
		});

		expect(deleted).toBe(false);
	});

	it("treats an already deleted registration as deleted", async () => {
		const { call } = routes({});

		await expect(
			new McpOAuthClient({ fetch: call }).unregister({
				clientId: "c",
				tokenEndpoint: DISCOVERY.tokenEndpoint,
				registrationAccessToken: "rat",
				registrationClientUri: "https://auth.example.com/register/c",
			}),
		).resolves.toBe(true);
	});
});

describe("revocation", () => {
	it("does nothing when the provider publishes no revocation endpoint", async () => {
		const { call, calls } = routes({});

		const revoked = await new McpOAuthClient({ fetch: call }).revoke(
			DISCOVERY,
			{ clientId: "c", tokenEndpoint: DISCOVERY.tokenEndpoint },
			{ token: "t" },
		);

		expect(revoked).toBe(false);
		expect(calls).toHaveLength(0);
	});

	it("hands the token back when there is somewhere to hand it to", async () => {
		const { call, calls } = routes({ "https://auth.example.com/revoke": {} });

		const revoked = await new McpOAuthClient({ fetch: call }).revoke(
			{ ...DISCOVERY, revocationEndpoint: "https://auth.example.com/revoke" },
			{ clientId: "c", tokenEndpoint: DISCOVERY.tokenEndpoint },
			{ token: "t", tokenType: "access_token" },
		);

		expect(revoked).toBe(true);
		expect(calls.at(-1)?.url).toBe("https://auth.example.com/revoke");
	});
});

describe("discovery over a network the operator owns", () => {
	const LOCAL = {
		"http://127.0.0.1:5176/.well-known/oauth-protected-resource/mcp": {
			body: { authorization_servers: ["http://127.0.0.1:5176"] },
		},
		"http://127.0.0.1:5176/.well-known/oauth-authorization-server": {
			body: {
				issuer: "http://127.0.0.1:5176",
				authorization_endpoint: "http://127.0.0.1:5176/authorize",
				token_endpoint: "http://127.0.0.1:5176/token",
			},
		},
	};

	it("refuses cleartext by default, because the credential would travel in the open", async () => {
		const { call } = routes(LOCAL);

		await expect(new McpOAuthClient({ fetch: call }).discover("http://127.0.0.1:5176/mcp")).rejects.toBeInstanceOf(
			McpDiscoveryError,
		);
	});

	it("allows it when private addresses were allowed, as the transport already does", async () => {
		// The guard is what decides, and it only allows cleartext for an address that really is private.
		// Refusing here as well made a local server unreachable that the transport connects to happily.
		const { call } = routes(LOCAL);

		const discovery = await new McpOAuthClient({ fetch: call, allowPrivateNetwork: true }).discover(
			"http://127.0.0.1:5176/mcp",
		);

		expect(discovery.tokenEndpoint).toBe("http://127.0.0.1:5176/token");
	});

	it("keeps refusing a public server over cleartext, which the guard has no exception for", async () => {
		await expect(
			new McpOAuthClient({ allowPrivateNetwork: true }).discover("http://203.0.113.10/mcp"),
		).rejects.toBeInstanceOf(McpBlockedTargetError);
	});
});

describe("the audience a token is bound to", () => {
	it("prefers the identifier the server published for itself", async () => {
		const { call } = routes({
			"https://api.example.com/.well-known/oauth-protected-resource/mcp": {
				body: { resource: "https://api.example.com/v1", authorization_servers: ["https://auth.example.com"] },
			},
			"https://auth.example.com/.well-known/oauth-authorization-server": {
				body: {
					issuer: "https://auth.example.com",
					authorization_endpoint: "https://auth.example.com/authorize",
					token_endpoint: "https://auth.example.com/token",
				},
			},
		});

		const discovery = await new McpOAuthClient({ fetch: call }).discover("https://api.example.com/mcp");

		expect(discovery.resource).toBe("https://api.example.com/v1");
	});
});
