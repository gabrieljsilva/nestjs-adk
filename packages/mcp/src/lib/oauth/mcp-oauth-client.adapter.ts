import { createHash, randomBytes } from "node:crypto";
import { McpDiscoveryError } from "../errors/mcp-discovery.error";
import type { McpClientAuthMethod, McpClientInfo, McpTokens } from "../mcp-auth.service";
import { type TargetTrust, guardedFetch } from "../mcp-target-guard.service";
import { McpMetadataReader } from "./mcp-metadata-reader.adapter";
import { McpResponseBody } from "./mcp-response-body.value-object";
import { McpTokenEndpoint } from "./mcp-token-endpoint.adapter";

/**
 * What the server published about how to authorize against it. Discovered rather than configured,
 * which is the point of dynamic registration: connecting to a server the developer never saw
 * before should not require reading its documentation.
 */
export interface McpDiscovery {
	issuer: string;
	authorizationEndpoint: string;
	tokenEndpoint: string;
	registrationEndpoint?: string;
	/** RFC 7009. Present when the provider accepts a token being handed back on uninstall. */
	revocationEndpoint?: string;
	scopesSupported?: string[];
	/** RFC 7591: which client authentication methods the token endpoint accepts. */
	tokenEndpointAuthMethodsSupported?: string[];
	grantTypesSupported?: string[];
	/**
	 * As announced by the server. Observability only: PKCE with S256 is always sent regardless,
	 * because the MCP spec requires it; this field lets an application log the servers that do not
	 * announce it and learn about them from telemetry instead of from a support ticket.
	 */
	codeChallengeMethodsSupported?: string[];
	/** RFC 8707 audience: the MCP server this token is meant for. */
	resource?: string;
}

export interface McpOAuthClientOptions {
	/** Allow endpoints on private, loopback or link-local addresses. Default `false`. */
	allowPrivateNetwork?: boolean;
	/**
	 * Replaces the guarded fetch on every request of the flow. For a corporate proxy or a test;
	 * whatever is supplied is used as given, so a substitute owns the SSRF guard the default applies.
	 */
	fetch?: typeof fetch;
	/**
	 * Extra RFC 7591 fields sent when registering: `logo_uri`, `contacts`, `policy_uri`,
	 * `software_id` and anything a particular provider asks for. Merged over what this client
	 * builds, so a provider that needs a different `grant_types` can be accommodated without a fork.
	 */
	clientMetadata?: Record<string, unknown>;
	/**
	 * Client authentication methods, most preferred first, intersected with what the server
	 * announces. Default order keeps `client_secret_post`, which is what every provider this
	 * package has met accepts, ahead of the RFC 6749 default of `client_secret_basic`.
	 */
	authMethods?: McpClientAuthMethod[];
}

const DEFAULT_AUTH_METHODS: McpClientAuthMethod[] = ["client_secret_post", "client_secret_basic", "none"];

/**
 * The standardized steps of the MCP authorization flow: discover, register, authorize, exchange,
 * revoke and unregister.
 *
 * Stateless on purpose. Routes, session storage and persistence stay in the application, because
 * they are its concerns; only the parts the specification fixes live here, so nobody reimplements
 * discovery per integration. Instantiate one per trust boundary, or use the `McpOAuth` facade for
 * the default, public-internet configuration.
 */
export class McpOAuthClient {
	private readonly trust: TargetTrust;
	private readonly call: typeof fetch;

	public constructor(private readonly options: McpOAuthClientOptions = {}) {
		this.trust = options.allowPrivateNetwork ? "private-ok" : "user";
		this.call = options.fetch ?? guardedFetch(this.trust);
	}

	/** Reads the server's metadata to learn where to send the user and where to exchange the code. */
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

		// RFC 8414 §3.3: the issuer in the document must be the one we asked about, or the document is
		// describing somebody else's authorization server. The WHOLE issuer, path included: on a shared
		// host the tenants differ only by path, and comparing origins would accept any of them.
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
			// RFC 8707 and 9728: the resource identifier the server publishes for itself, which is the
			// value the authorization server will compare against. Falling back to the URL as given, path
			// included: reducing it to the origin names a different resource on any server not mounted
			// at the root, and the token comes back scoped to something else.
			resource: published?.resource ?? McpOAuthClient.normalized(base),
		};
	}

	/** Registers this application with the server, so no client id has to be provisioned by hand. */
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
			// The reason is in the body: an allowlist, an unsupported redirect, a rejected auth method.
			// Reporting only the status sends whoever is connecting to read our code instead of the answer.
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
			// The server is free to settle on a method other than the one asked for, and the token
			// endpoint has to be called with the one it chose.
			authMethod: McpOAuthClient.asAuthMethod(payload.token_endpoint_auth_method) ?? authMethod,
			// RFC 7591 §3.2.1: zero means the secret never expires. Without keeping this, the first sign
			// that a registration lapsed is every renewal failing at once, months later.
			...(payload.client_secret_expires_at ? { secretExpiresAt: new Date(payload.client_secret_expires_at * 1000) } : {}),
			registrationAccessToken: payload.registration_access_token,
			registrationClientUri: payload.registration_client_uri,
		};
	}

	/**
	 * Builds the URL to send the user to. The returned `verifier` must survive until the callback,
	 * it is what proves the code came back to whoever asked for it, so keep it server-side.
	 */
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

	/** Trades the code from the callback for tokens. */
	public exchange(
		client: McpClientInfo,
		options: { code: string; verifier: string; redirectUri: string; resource?: string },
	): Promise<McpTokens> {
		return this.tokenEndpoint(client).exchange(options);
	}

	/**
	 * Hands a token back to the provider on uninstall. Best effort: a provider that publishes no
	 * revocation endpoint leaves nothing to call, which is not a failure of the uninstall.
	 */
	public async revoke(
		discovery: McpDiscovery,
		client: McpClientInfo,
		options: { token: string; tokenType?: "access_token" | "refresh_token" },
	): Promise<boolean> {
		if (!discovery.revocationEndpoint) return false;
		await this.tokenEndpoint(client).revoke(discovery.revocationEndpoint, options.token, options.tokenType);
		return true;
	}

	/**
	 * RFC 7592: deletes a dynamic registration. Only possible for a client registered with this
	 * package, since it is the registration access token that authorizes the deletion. Answers
	 * `false` when the provider returned no management credentials to delete it with.
	 */
	public async unregister(client: McpClientInfo): Promise<boolean> {
		if (!client.registrationClientUri || !client.registrationAccessToken) return false;
		const response = await this.call(client.registrationClientUri, {
			method: "DELETE",
			headers: { authorization: `Bearer ${client.registrationAccessToken}` },
		});
		// 404 means somebody got there first, which is the state the caller asked for.
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

	/**
	 * Over plain HTTP the code and the client secret would travel in the clear. The refusal is left
	 * to the target guard when private addresses are allowed, because there it is decided by what the
	 * host resolves to: an operator's own network exposes cleartext to nobody, and a refusal here
	 * would make an internal server unreachable that the transport happily connects to.
	 */
	private assertReachableOverTls(serverUrl: string, url: URL, subject: string): URL {
		if (url.protocol !== "https:" && this.trust === "user") {
			throw new McpDiscoveryError(serverUrl, `${subject} is not served over https`);
		}
		return url;
	}

	private negotiatedAuthMethod(discovery: McpDiscovery): McpClientAuthMethod {
		const preferred = this.options.authMethods ?? DEFAULT_AUTH_METHODS;
		const supported = discovery.tokenEndpointAuthMethodsSupported;
		// A server that announces nothing gets the first preference: RFC 8414 makes the field optional,
		// and refusing to register over a missing field would fail against providers that work today.
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

	/** Asking for a grant the server does not support is how a registration gets refused wholesale. */
	private static readGrantTypes(discovery: McpDiscovery): string[] {
		const supported = discovery.grantTypesSupported;
		if (!supported?.length) return ["authorization_code", "refresh_token"];
		return ["authorization_code", "refresh_token"].filter((grant) => supported.includes(grant));
	}

	private static asAuthMethod(value?: string): McpClientAuthMethod | undefined {
		return DEFAULT_AUTH_METHODS.find((method) => method === value);
	}

	/** One URL, one spelling: a comparison must not fail on a trailing slash the RFC says nothing about. */
	private static normalized(url: URL): string {
		return `${url.origin}${url.pathname.replace(/\/+$/, "")}`;
	}
}
