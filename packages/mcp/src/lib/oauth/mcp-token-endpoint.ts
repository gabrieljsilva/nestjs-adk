import { McpBlockedTargetError } from "../errors/mcp-blocked-target.error";
import { type McpGrantRejection, McpTokenGrantError } from "../errors/mcp-token-grant.error";
import type { McpClientAuthMethod, McpClientInfo, McpTokens } from "../mcp-auth";
import { type TargetTrust, guardedFetch } from "../mcp-target-guard";
import { McpResponseBody } from "./mcp-response-body";

/** What a provider says when the credential itself is finished, rather than this attempt. */
const TERMINAL_ERRORS = new Set(["invalid_grant", "invalid_client", "unauthorized_client", "access_denied"]);

export interface McpTokenEndpointOptions {
	/** Refuse private addresses (`"user"`, the default) or allow them (`"private-ok"`). */
	trust?: TargetTrust;
	/**
	 * Replaces the guarded fetch. For a corporate proxy or a test; whatever is supplied is used as
	 * given, so a substitute is responsible for the SSRF guard the default one applies.
	 */
	fetch?: typeof fetch;
}

/**
 * Every call this client makes to its token endpoint: the code exchange, renewal and revocation.
 *
 * One class because the three requests differ by two form fields and share everything that is
 * actually hard, which is the client authentication method, the two response dialects and telling
 * a dead credential from a provider having a bad minute. Renewal used to live apart and drifted:
 * it read only JSON, classified every refusal as "sign in again" and skipped the target guard.
 */
export class McpTokenEndpoint {
	public constructor(
		private readonly client: McpClientInfo,
		private readonly options: McpTokenEndpointOptions = {},
	) {}

	/** Trades an authorization code for tokens. */
	public exchange(grant: {
		code: string;
		verifier: string;
		redirectUri: string;
		resource?: string;
	}): Promise<McpTokens> {
		return this.grant(this.client.tokenEndpoint, {
			grant_type: "authorization_code",
			code: grant.code,
			redirect_uri: grant.redirectUri,
			code_verifier: grant.verifier,
			...(grant.resource ? { resource: grant.resource } : {}),
		});
	}

	/**
	 * Renews an access token. The answer carries the refresh token to store from now on when the
	 * provider rotates them, and the one that was sent when it does not.
	 */
	public async renew(refreshToken: string, options: { resource?: string; scope?: string } = {}): Promise<McpTokens> {
		const tokens = await this.grant(this.client.tokenEndpoint, {
			grant_type: "refresh_token",
			refresh_token: refreshToken,
			...(options.resource ? { resource: options.resource } : {}),
			...(options.scope ? { scope: options.scope } : {}),
		});
		// A provider that does not rotate answers without the field, and dropping it locks the user out
		// on the following run.
		return { ...tokens, refreshToken: tokens.refreshToken ?? refreshToken };
	}

	/**
	 * RFC 7009. Best effort by design: the specification tells the server to answer 200 for a token
	 * it does not recognize, so a refusal here means the request was wrong, never that the token
	 * survived.
	 */
	public async revoke(
		revocationEndpoint: string,
		token: string,
		hint?: "access_token" | "refresh_token",
	): Promise<void> {
		const response = await this.send(
			revocationEndpoint,
			this.authenticated({
				token,
				...(hint ? { token_type_hint: hint } : {}),
			}),
		);
		if (!response.ok) {
			const body = await McpResponseBody.readOrEmpty(response);
			throw this.rejected(revocationEndpoint, response.status, body);
		}
	}

	private async grant(endpoint: string, fields: Record<string, string>): Promise<McpTokens> {
		const response = await this.send(endpoint, this.authenticated(fields));
		const body = await McpResponseBody.read(response);

		if (!response.ok) throw this.rejected(endpoint, response.status, body);
		if (body.error) throw this.rejected(endpoint, response.status, body);

		const accessToken = body.text("access_token");
		if (!accessToken) {
			throw new McpTokenGrantError(endpoint, "invalid-request", "the response carried no access token", response.status);
		}

		const expiresIn = body.seconds("expires_in");
		return {
			accessToken,
			refreshToken: body.text("refresh_token"),
			// The granted scope, which is not always the requested one: a provider is free to narrow it,
			// and an application that shows what an integration can do has to read what it was given.
			scope: body.text("scope"),
			...(expiresIn !== undefined && expiresIn > 0 ? { expiresAt: new Date(Date.now() + expiresIn * 1000) } : {}),
		};
	}

	/** Client authentication, in the method the registration settled on. */
	private authenticated(fields: Record<string, string>): { body: URLSearchParams; headers: Record<string, string> } {
		const method = this.authMethod();
		const headers: Record<string, string> = {};
		const body = new URLSearchParams(fields);

		if (method === "client_secret_basic") {
			// RFC 6749 §2.3.1: both halves are form-urlencoded before the colon, and the client id is
			// not repeated in the body.
			const pair = `${encodeURIComponent(this.client.clientId)}:${encodeURIComponent(this.client.clientSecret ?? "")}`;
			headers.authorization = `Basic ${Buffer.from(pair).toString("base64")}`;
			return { body, headers };
		}

		body.set("client_id", this.client.clientId);
		if (method === "client_secret_post" && this.client.clientSecret) {
			body.set("client_secret", this.client.clientSecret);
		}
		return { body, headers };
	}

	private authMethod(): McpClientAuthMethod {
		if (!this.client.clientSecret) return "none";
		return this.client.authMethod ?? "client_secret_post";
	}

	private async send(
		endpoint: string,
		request: { body: URLSearchParams; headers: Record<string, string> },
	): Promise<Response> {
		const call = this.options.fetch ?? guardedFetch(this.options.trust ?? "user");
		try {
			return await call(endpoint, {
				method: "POST",
				headers: {
					"content-type": "application/x-www-form-urlencoded",
					// GitHub, among others, defaults to answering form-encoded and only switches to JSON when
					// asked. Both dialects are read anyway; asking is what keeps the common case boring.
					accept: "application/json",
					...request.headers,
				},
				body: request.body,
			});
		} catch (error) {
			// A blocked target is a refusal, not an unreachable provider: folding it into a transient
			// failure would report an SSRF attempt as a network hiccup, and retry it.
			if (error instanceof McpBlockedTargetError) throw error;
			throw new McpTokenGrantError(
				endpoint,
				"transient",
				error instanceof Error ? error.message : String(error),
				undefined,
				undefined,
				{ cause: error },
			);
		}
	}

	private rejected(endpoint: string, status: number, body: McpResponseBody): McpTokenGrantError {
		const oauthError = body.error;
		return new McpTokenGrantError(
			endpoint,
			McpTokenEndpoint.rejectionOf(status, oauthError),
			body.explanation ?? `the provider answered ${status}`,
			status,
			oauthError,
		);
	}

	/**
	 * The OAuth error code decides first, because it describes the grant; the status only describes
	 * the HTTP call, and a provider that rate limits answers 429 about neither.
	 */
	private static rejectionOf(status: number, oauthError?: string): McpGrantRejection {
		if (oauthError && TERMINAL_ERRORS.has(oauthError)) return "reauth-required";
		if (status === 429 || status >= 500) return "transient";
		// RFC 6749 §5.2: a token endpoint refusing a grant answers 400, and at a refresh that means the
		// refresh token is spent even when the provider names no error code. Treating it as a bad
		// request would leave a dead credential in place and fail every run from here on.
		if (status === 400 || status === 401 || status === 403) return "reauth-required";
		return "invalid-request";
	}
}
