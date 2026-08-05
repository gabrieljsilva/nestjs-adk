import { createHash, randomBytes } from "node:crypto";
import { AdkError } from "@nestjs-adk/core";
import { McpBlockedTargetError } from "./errors/mcp-blocked-target.error";
import type { McpClientInfo, McpTokens } from "./mcp-auth";
import { type TargetTrust, guardedFetch } from "./mcp-target-guard";

/**
 * What the server published about how to authorize against it. Discovered rather than configured,
 * which is the point of dynamic registration: connecting to a server the developer never saw before
 * should not require reading its documentation.
 */
export interface McpDiscovery {
	issuer: string;
	authorizationEndpoint: string;
	tokenEndpoint: string;
	registrationEndpoint?: string;
	scopesSupported?: string[];
	/**
	 * As announced by the server. Observability only: PKCE with S256 is always sent regardless,
	 * because the MCP spec requires it; this field lets an application log the servers that do not
	 * announce it and learn about them from telemetry instead of from a support ticket.
	 */
	codeChallengeMethodsSupported?: string[];
	/** RFC 8707 audience: the MCP server this token is meant for. */
	resource?: string;
}

export class McpDiscoveryError extends AdkError {
	public readonly code = "MCP_DISCOVERY_FAILED";

	public constructor(serverUrl: string, reason: string) {
		super(`Could not discover how to authorize with "${serverUrl}": ${reason}`);
	}
}

/**
 * Every fetch of the OAuth flow goes through the target guard. Not only `discover`'s first hop:
 * the endpoints later calls POST to came out of the server's own metadata, and a malicious server
 * naming `https://10.0.0.5/token` as its token endpoint is the same SSRF with one extra step.
 */
export interface McpOAuthFetchOptions {
	/** Allow endpoints on private, loopback or link-local addresses. Default `false`. */
	allowPrivateNetwork?: boolean;
}

function trustOf(options?: McpOAuthFetchOptions): TargetTrust {
	return options?.allowPrivateNetwork ? "private-ok" : "user";
}

/**
 * The four standardized steps of the MCP authorization flow. Stateless on purpose: routes, session
 * storage and persistence stay in the application, because they are its concerns; only the parts
 * the specification fixes live here, so nobody reimplements discovery per integration.
 */
export const McpOAuth = {
	/** Reads the server's metadata to learn where to send the user and where to exchange the code. */
	async discover(serverUrl: string, options?: McpOAuthFetchOptions): Promise<McpDiscovery> {
		const trust = trustOf(options);
		const base = new URL(serverUrl);
		const resource = await fetchFirst(wellKnown(base, ["oauth-protected-resource"]), trust);
		if (!resource.body && resource.failure) throw new McpDiscoveryError(serverUrl, resource.failure);
		const issuer =
			(resource.body as { authorization_servers?: string[] } | undefined)?.authorization_servers?.[0] ?? base.origin;

		// The server nominates its own authorization server, so everything about it is untrusted input.
		// Over plain HTTP the code and the client secret would travel in the clear, and a metadata
		// document that names a different issuer than the one asked is the confused-deputy setup: the
		// user consents on a real provider's screen and the token comes back scoped to somebody else.
		const issuerUrl = new URL(issuer);
		if (issuerUrl.protocol !== "https:") {
			throw new McpDiscoveryError(serverUrl, `authorization server ${issuerUrl.origin} is not served over https`);
		}

		const found = await fetchFirst(wellKnown(issuerUrl, ["oauth-authorization-server", "openid-configuration"]), trust);
		if (!found.body && found.failure) throw new McpDiscoveryError(serverUrl, found.failure);
		const metadata = found.body as
			| {
					issuer?: string;
					authorization_endpoint?: string;
					token_endpoint?: string;
					registration_endpoint?: string;
					scopes_supported?: string[];
					code_challenge_methods_supported?: string[];
			  }
			| undefined;

		if (!metadata?.authorization_endpoint || !metadata.token_endpoint) {
			throw new McpDiscoveryError(serverUrl, "it publishes no authorization metadata; supply a credential manually");
		}

		// RFC 8414 §3.3: the issuer in the document must be the one we asked about, or the document is
		// describing somebody else's authorization server. The WHOLE issuer, path included: on a shared
		// host the tenants differ only by path, and comparing origins would accept any of them.
		if (metadata.issuer && normalized(new URL(metadata.issuer)) !== normalized(issuerUrl)) {
			throw new McpDiscoveryError(serverUrl, `metadata claims issuer ${metadata.issuer}, which is not ${issuer}`);
		}
		for (const endpoint of [metadata.authorization_endpoint, metadata.token_endpoint, metadata.registration_endpoint]) {
			if (endpoint && new URL(endpoint).protocol !== "https:") {
				throw new McpDiscoveryError(serverUrl, `endpoint ${endpoint} is not served over https`);
			}
		}

		return {
			issuer: metadata.issuer ?? issuer,
			authorizationEndpoint: metadata.authorization_endpoint,
			tokenEndpoint: metadata.token_endpoint,
			registrationEndpoint: metadata.registration_endpoint,
			scopesSupported: metadata.scopes_supported,
			codeChallengeMethodsSupported: metadata.code_challenge_methods_supported,
			// RFC 8707: binds the token to this server, so a token issued for it cannot be replayed
			// against another resource that trusts the same authorization server.
			resource: base.origin,
		};
	},

	/** Registers this application with the server, so no client id has to be provisioned by hand. */
	async register(
		discovery: McpDiscovery,
		options: { redirectUri: string; clientName: string } & McpOAuthFetchOptions,
	): Promise<McpClientInfo> {
		if (!discovery.registrationEndpoint) {
			throw new McpDiscoveryError(discovery.issuer, "it does not support dynamic client registration");
		}

		const response = await guardedFetch(trustOf(options))(discovery.registrationEndpoint, {
			method: "POST",
			headers: { "content-type": "application/json" },
			body: JSON.stringify({
				client_name: options.clientName,
				redirect_uris: [options.redirectUri],
				grant_types: ["authorization_code", "refresh_token"],
				response_types: ["code"],
				token_endpoint_auth_method: "client_secret_post",
			}),
		});

		if (!response.ok) {
			// The reason is in the body: an allowlist, an unsupported redirect, a rejected auth method.
			// Reporting only the status sends whoever is connecting to read our code instead of the answer.
			const explained = await explanationOf(response);
			throw new McpDiscoveryError(
				discovery.issuer,
				explained
					? `registration failed with ${response.status}: ${explained}`
					: `registration failed with ${response.status}`,
			);
		}

		const payload = (await response.json()) as { client_id?: string; client_secret?: string };
		if (!payload.client_id) throw new McpDiscoveryError(discovery.issuer, "registration returned no client id");

		return {
			clientId: payload.client_id,
			clientSecret: payload.client_secret,
			tokenEndpoint: discovery.tokenEndpoint,
		};
	},

	/**
	 * Builds the URL to send the user to. The returned `verifier` must survive until the callback,
	 * it is what proves the code came back to whoever asked for it, so keep it server-side.
	 */
	authorize(
		discovery: McpDiscovery,
		client: McpClientInfo,
		options: { redirectUri: string; scopes?: string[]; state?: string },
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
		if (discovery.resource) url.searchParams.set("resource", discovery.resource);

		return { url: url.toString(), verifier, state };
	},

	/** Trades the code from the callback for tokens. */
	async exchange(
		client: McpClientInfo,
		options: { code: string; verifier: string; redirectUri: string; resource?: string } & McpOAuthFetchOptions,
	): Promise<McpTokens> {
		const body = new URLSearchParams({
			grant_type: "authorization_code",
			code: options.code,
			redirect_uri: options.redirectUri,
			code_verifier: options.verifier,
			client_id: client.clientId,
			...(client.clientSecret ? { client_secret: client.clientSecret } : {}),
			...(options.resource ? { resource: options.resource } : {}),
		});

		const response = await guardedFetch(trustOf(options))(client.tokenEndpoint, {
			method: "POST",
			// GitHub, among others, defaults to answering form-encoded and only switches to JSON when
			// asked. Both dialects are read below anyway; asking is what keeps the common case boring.
			headers: { "content-type": "application/x-www-form-urlencoded", accept: "application/json" },
			body,
		});

		const payload = (await decode(response)) as {
			access_token?: string;
			refresh_token?: string;
			expires_in?: number | string;
			error?: string;
			error_description?: string;
		};

		if (!response.ok) {
			const explained = payload.error_description ?? payload.error;
			throw new McpDiscoveryError(
				client.tokenEndpoint,
				explained
					? `token exchange failed with ${response.status}: ${explained}`
					: `token exchange failed with ${response.status}`,
			);
		}
		// An OAuth error can ride on a 200: the status describes the HTTP call, not the grant.
		if (payload.error || payload.error_description) {
			throw new McpDiscoveryError(client.tokenEndpoint, payload.error_description ?? (payload.error as string));
		}
		if (!payload.access_token)
			throw new McpDiscoveryError(client.tokenEndpoint, "token response carried no access token");

		const expiresIn = Number(payload.expires_in);

		return {
			accessToken: payload.access_token,
			refreshToken: payload.refresh_token,
			...(Number.isFinite(expiresIn) && expiresIn > 0 ? { expiresAt: new Date(Date.now() + expiresIn * 1000) } : {}),
		};
	},
};

/**
 * Where a well-known document may live, most specific first. RFC 8414 §3.1 and RFC 9728 insert the
 * path of the issuer or resource AFTER the well-known segment, so a server mounted on `/mcp` publishes
 * at `/.well-known/oauth-protected-resource/mcp` and legitimately answers 404 at the root. Asking the
 * path-inserted location first also matters on a shared host, where the root document describes
 * somebody else's tenant.
 */
function wellKnown(target: URL, names: string[]): URL[] {
	const path = target.pathname.replace(/\/+$/, "");
	const candidates: URL[] = [];
	for (const name of names) {
		if (path) candidates.push(new URL(`/.well-known/${name}${path}`, target));
		// OpenID Connect Discovery is the one dialect that APPENDS the path instead of inserting it:
		// `{issuer}/.well-known/openid-configuration`. A provider mounted on a path publishes there.
		if (path && name === "openid-configuration") candidates.push(new URL(`${path}/.well-known/${name}`, target));
		candidates.push(new URL(`/.well-known/${name}`, target));
	}
	return candidates;
}

/** One issuer, one spelling: the comparison must not fail on a trailing slash the RFC says nothing about. */
function normalized(url: URL): string {
	return `${url.origin}${url.pathname.replace(/\/+$/, "")}`;
}

/** The first candidate that answers with a document wins; a 404 just means "not here, try the next". */
async function fetchFirst(candidates: URL[], trust: TargetTrust): Promise<{ body?: unknown; failure?: string }> {
	let firstFailure: string | undefined;
	for (const candidate of candidates) {
		const found = await fetchJson(candidate, trust);
		if (found.body) return found;
		firstFailure ??= found.failure;
	}
	return { failure: firstFailure };
}

/** Body of a refusal, in whichever dialect the provider chose, reduced to something worth logging. */
async function explanationOf(response: Response): Promise<string | undefined> {
	try {
		const payload = (await decode(response)) as { error?: unknown; error_description?: unknown; message?: unknown };
		for (const value of [payload.error_description, payload.message, payload.error]) {
			if (typeof value === "string" && value.trim()) return value.trim();
		}
	} catch {
		// A body that decodes into nothing useful is not worth failing over: the status still speaks.
	}
	return undefined;
}

/**
 * OAuth allows both JSON and form encoding for token responses, and providers disagree: GitHub answers
 * `access_token=...` while most answer JSON. Reading the content type first, and falling back to the
 * other dialect, is cheaper than a per-provider quirk table.
 */
async function decode(response: Response): Promise<Record<string, unknown>> {
	const text = await response.text();
	const type = response.headers.get("content-type") ?? "";
	if (!type.includes("form-urlencoded")) {
		try {
			const parsed = JSON.parse(text);
			return typeof parsed === "object" && parsed !== null ? (parsed as Record<string, unknown>) : {};
		} catch {
			// Fall through: a provider mislabelling form data as JSON is still answering something.
		}
	}
	return Object.fromEntries(new URLSearchParams(text));
}

/** A missing well-known document is a normal answer, not a failure; the caller decides what it means. */
async function fetchJson(url: URL, trust: TargetTrust): Promise<{ body?: unknown; failure?: string }> {
	try {
		const response = await guardedFetch(trust)(url, { headers: { accept: "application/json" } });
		if (response.status === 404) return {};
		if (!response.ok) return { failure: `${url.origin} answered ${response.status}` };
		return { body: await response.json() };
	} catch (error) {
		// A blocked target is a refusal, not an unreachable server: folding it into `failure` would
		// report an SSRF attempt as a network hiccup.
		if (error instanceof McpBlockedTargetError) throw error;
		return { failure: `${url.origin} is unreachable: ${error instanceof Error ? error.message : String(error)}` };
	}
}
