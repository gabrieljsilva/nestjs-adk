import { createHash, randomBytes } from "node:crypto";
import { McpDiscoveryError } from "../errors/mcp-discovery.error";
import type { McpClientAuthMethod, McpClientInfo, McpTokens } from "../mcp-auth.service";
import { type TargetTrust, guardedFetch } from "../mcp-target-guard.service";
import { McpMetadataReader } from "./mcp-metadata-reader.adapter";
import { McpResponseBody } from "./mcp-response-body.value-object";
import { McpTokenEndpoint } from "./mcp-token-endpoint.adapter";

/**
 * What a server's own metadata said about authorizing with it: where to send a person, where to
 * exchange and renew tokens, and which methods, grants and scopes it supports. Keep it, or a
 * renewal has to discover everything again.
 */
export interface McpDiscovery {
	issuer: string;
	authorizationEndpoint: string;
	tokenEndpoint: string;
	registrationEndpoint?: string;
	revocationEndpoint?: string;
	scopesSupported?: string[];
	tokenEndpointAuthMethodsSupported?: string[];
	grantTypesSupported?: string[];
	codeChallengeMethodsSupported?: string[];
	resource?: string;
}

/**
 * The knobs on the OAuth flow. `allowPrivateNetwork` reaches a server on your own network,
 * cleartext included; `clientMetadata` adds RFC 7591 fields a provider asks for; `authMethods`
 * is a preference order intersected with what the server accepts; and a substituted `fetch`
 * replaces the guarded one and then owns the SSRF guard itself.
 */
export interface McpOAuthClientOptions {
	allowPrivateNetwork?: boolean;
	fetch?: typeof fetch;
	clientMetadata?: Record<string, unknown>;
	authMethods?: McpClientAuthMethod[];
}

const DEFAULT_AUTH_METHODS: McpClientAuthMethod[] = ["client_secret_post", "client_secret_basic", "none"];

/**
 * Discovery, registration, consent, exchange, revocation and unregistration for one MCP server,
 * with the knobs exposed. `McpOAuth` is the same flow on the defaults.
 *
 * PKCE with S256 is always sent, so the verifier has to survive server side until the callback.
 * Every hop is checked against the SSRF guard, including the endpoints the server's own metadata
 * named. Discovery that fails throws `McpDiscoveryError`, and a refusal from the token endpoint
 * `McpTokenGrantError`.
 */
export class McpOAuthClient {
	private readonly trust: TargetTrust;
	private readonly call: typeof fetch;

	public constructor(private readonly options: McpOAuthClientOptions = {}) {
		this.trust = options.allowPrivateNetwork ? "private-ok" : "user";
		this.call = options.fetch ?? guardedFetch(this.trust);
	}

	public async discover(serverUrl: string): Promise<McpDiscovery> {
		const reader = new McpMetadataReader(this.trust, this.call);
		const base = new URL(serverUrl);
		const resource = await reader.read(base, ["oauth-protected-resource"]);
		if (!resource.body && resource.failure) throw new McpDiscoveryError(serverUrl, resource.failure);

		const published = resource.body as
			| { authorization_servers?: string[]; resource?: string; scopes_supported?: string[] }
			| undefined;
		const issuer = published?.authorization_servers?.[0] ?? base.origin;
		const issuerUrl = this.assertReachableOverTls(serverUrl, new URL(issuer), `authorization server ${issuer}`);

		const found = await reader.read(issuerUrl, ["oauth-authorization-server", "openid-configuration"]);
		if (!found.body && found.failure) throw new McpDiscoveryError(serverUrl, found.failure);
		const metadata = found.body as
			| {
					issuer?: string;
					authorization_endpoint?: string;
					token_endpoint?: string;
					registration_endpoint?: string;
					revocation_endpoint?: string;
					scopes_supported?: string[];
					token_endpoint_auth_methods_supported?: string[];
					grant_types_supported?: string[];
					code_challenge_methods_supported?: string[];
			  }
			| undefined;

		if (!metadata?.authorization_endpoint || !metadata.token_endpoint) {
			throw new McpDiscoveryError(serverUrl, "it publishes no authorization metadata; supply a credential manually");
		}

		if (metadata.issuer && McpOAuthClient.normalized(new URL(metadata.issuer)) !== McpOAuthClient.normalized(issuerUrl)) {
			throw new McpDiscoveryError(serverUrl, `metadata claims issuer ${metadata.issuer}, which is not ${issuer}`);
		}
		for (const endpoint of [
			metadata.authorization_endpoint,
			metadata.token_endpoint,
			metadata.registration_endpoint,
			metadata.revocation_endpoint,
		]) {
			if (endpoint) this.assertReachableOverTls(serverUrl, new URL(endpoint), `endpoint ${endpoint}`);
		}

		return {
			issuer: metadata.issuer ?? issuer,
			authorizationEndpoint: metadata.authorization_endpoint,
			tokenEndpoint: metadata.token_endpoint,
			registrationEndpoint: metadata.registration_endpoint,
			revocationEndpoint: metadata.revocation_endpoint,
			scopesSupported: metadata.scopes_supported ?? published?.scopes_supported,
			tokenEndpointAuthMethodsSupported: metadata.token_endpoint_auth_methods_supported,
			grantTypesSupported: metadata.grant_types_supported,
			codeChallengeMethodsSupported: metadata.code_challenge_methods_supported,
			resource: published?.resource ?? McpOAuthClient.normalized(base),
		};
	}

	public async register(
		discovery: McpDiscovery,
		options: { redirectUri: string; clientName: string },
	): Promise<McpClientInfo> {
		if (!discovery.registrationEndpoint) {
			throw new McpDiscoveryError(discovery.issuer, "it does not support dynamic client registration");
		}

		const authMethod = this.negotiatedAuthMethod(discovery);
		const response = await this.call(discovery.registrationEndpoint, {
			method: "POST",
			headers: { "content-type": "application/json" },
			body: JSON.stringify({
				client_name: options.clientName,
				redirect_uris: [options.redirectUri],
				grant_types: McpOAuthClient.readGrantTypes(discovery),
				response_types: ["code"],
				token_endpoint_auth_method: authMethod,
				...this.options.clientMetadata,
			}),
		});

		if (!response.ok) {
			const explained = (await McpResponseBody.readOrEmpty(response)).explanation;
			throw new McpDiscoveryError(
				discovery.issuer,
				explained
					? `registration failed with ${response.status}: ${explained}`
					: `registration failed with ${response.status}`,
			);
		}

		const payload = (await response.json()) as {
			client_id?: string;
			client_secret?: string;
			client_secret_expires_at?: number;
			registration_access_token?: string;
			registration_client_uri?: string;
			token_endpoint_auth_method?: string;
		};
		if (!payload.client_id) throw new McpDiscoveryError(discovery.issuer, "registration returned no client id");

		return {
			clientId: payload.client_id,
			clientSecret: payload.client_secret,
			tokenEndpoint: discovery.tokenEndpoint,
			authMethod: McpOAuthClient.asAuthMethod(payload.token_endpoint_auth_method) ?? authMethod,
			...(payload.client_secret_expires_at ? { secretExpiresAt: new Date(payload.client_secret_expires_at * 1000) } : {}),
			registrationAccessToken: payload.registration_access_token,
			registrationClientUri: payload.registration_client_uri,
		};
	}

	public authorize(
		discovery: McpDiscovery,
		client: McpClientInfo,
		options: { redirectUri: string; scopes?: string[]; state?: string; resource?: string },
	): { url: string; verifier: string; state: string } {
		const verifier = randomBytes(32).toString("base64url");
		const challenge = createHash("sha256").update(verifier).digest("base64url");
		const state = options.state ?? randomBytes(16).toString("base64url");

		const url = new URL(discovery.authorizationEndpoint);
		url.searchParams.set("response_type", "code");
		url.searchParams.set("client_id", client.clientId);
		url.searchParams.set("redirect_uri", options.redirectUri);
		url.searchParams.set("code_challenge", challenge);
		url.searchParams.set("code_challenge_method", "S256");
		url.searchParams.set("state", state);
		const scopes = options.scopes ?? discovery.scopesSupported;
		if (scopes?.length) url.searchParams.set("scope", scopes.join(" "));
		const resource = options.resource ?? discovery.resource;
		if (resource) url.searchParams.set("resource", resource);

		return { url: url.toString(), verifier, state };
	}

	public exchange(
		client: McpClientInfo,
		options: { code: string; verifier: string; redirectUri: string; resource?: string },
	): Promise<McpTokens> {
		return this.tokenEndpoint(client).exchange(options);
	}

	public async revoke(
		discovery: McpDiscovery,
		client: McpClientInfo,
		options: { token: string; tokenType?: "access_token" | "refresh_token" },
	): Promise<boolean> {
		if (!discovery.revocationEndpoint) return false;
		await this.tokenEndpoint(client).revoke(discovery.revocationEndpoint, options.token, options.tokenType);
		return true;
	}

	public async unregister(client: McpClientInfo): Promise<boolean> {
		if (!client.registrationClientUri || !client.registrationAccessToken) return false;
		const response = await this.call(client.registrationClientUri, {
			method: "DELETE",
			headers: { authorization: `Bearer ${client.registrationAccessToken}` },
		});
		if (!response.ok && response.status !== 404) {
			throw new McpDiscoveryError(
				client.registrationClientUri,
				`deleting the registration failed with ${response.status}`,
			);
		}
		return true;
	}

	private tokenEndpoint(client: McpClientInfo): McpTokenEndpoint {
		return new McpTokenEndpoint(client, { trust: this.trust, fetch: this.options.fetch });
	}

	private assertReachableOverTls(serverUrl: string, url: URL, subject: string): URL {
		if (url.protocol !== "https:" && this.trust === "user") {
			throw new McpDiscoveryError(serverUrl, `${subject} is not served over https`);
		}
		return url;
	}

	private negotiatedAuthMethod(discovery: McpDiscovery): McpClientAuthMethod {
		const preferred = this.options.authMethods ?? DEFAULT_AUTH_METHODS;
		const supported = discovery.tokenEndpointAuthMethodsSupported;
		if (!supported?.length) return preferred[0] ?? "client_secret_post";
		const agreed = preferred.find((method) => supported.includes(method));
		if (!agreed) {
			throw new McpDiscoveryError(
				discovery.issuer,
				`it accepts none of the client authentication methods this client supports (it wants ${supported.join(", ")})`,
			);
		}
		return agreed;
	}

	private static readGrantTypes(discovery: McpDiscovery): string[] {
		const supported = discovery.grantTypesSupported;
		if (!supported?.length) return ["authorization_code", "refresh_token"];
		return ["authorization_code", "refresh_token"].filter((grant) => supported.includes(grant));
	}

	private static asAuthMethod(value?: string): McpClientAuthMethod | undefined {
		return DEFAULT_AUTH_METHODS.find((method) => method === value);
	}

	private static normalized(url: URL): string {
		return `${url.origin}${url.pathname.replace(/\/+$/, "")}`;
	}
}
