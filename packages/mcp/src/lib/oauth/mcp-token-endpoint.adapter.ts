import { McpBlockedTargetError } from "../errors/mcp-blocked-target.error";
import { type McpGrantRejection, McpTokenGrantError } from "../errors/mcp-token-grant.error";
import type { McpClientAuthMethod, McpClientInfo, McpTokens } from "../mcp-auth.service";
import { type TargetTrust, guardedFetch } from "../mcp-target-guard.service";
import { McpResponseBody } from "./mcp-response-body.value-object";

const TERMINAL_ERRORS = new Set(["invalid_grant", "invalid_client", "unauthorized_client", "access_denied"]);

/**
 * How one client's calls to its token endpoint reach the network: how much the target is
 * trusted, and a fetch that replaces the guarded one.
 */
export interface McpTokenEndpointOptions {
	trust?: TargetTrust;
	fetch?: typeof fetch;
}

/**
 * One registered client's calls to its token endpoint: exchange a code, renew with a refresh
 * token, revoke what the provider will take back.
 *
 * Client authentication follows the `authMethod` the registration settled on. Every refusal is
 * an `McpTokenGrantError` whose `rejection` says whether the credential is finished or the
 * provider was only briefly unwilling.
 */
export class McpTokenEndpoint {
	public constructor(
		private readonly client: McpClientInfo,
		private readonly options: McpTokenEndpointOptions = {},
	) {}

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

	public async renew(refreshToken: string, options: { resource?: string; scope?: string } = {}): Promise<McpTokens> {
		const tokens = await this.grant(this.client.tokenEndpoint, {
			grant_type: "refresh_token",
			refresh_token: refreshToken,
			...(options.resource ? { resource: options.resource } : {}),
			...(options.scope ? { scope: options.scope } : {}),
		});
		return { ...tokens, refreshToken: tokens.refreshToken ?? refreshToken };
	}

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
			scope: body.text("scope"),
			...(expiresIn !== undefined && expiresIn > 0 ? { expiresAt: new Date(Date.now() + expiresIn * 1000) } : {}),
		};
	}

	private authenticated(fields: Record<string, string>): { body: URLSearchParams; headers: Record<string, string> } {
		const method = this.authMethod();
		const headers: Record<string, string> = {};
		const body = new URLSearchParams(fields);

		if (method === "client_secret_basic") {
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
					accept: "application/json",
					...request.headers,
				},
				body: request.body,
			});
		} catch (error) {
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
			McpTokenEndpoint.buildRejection(status, oauthError),
			body.explanation ?? `the provider answered ${status}`,
			status,
			oauthError,
		);
	}

	private static buildRejection(status: number, oauthError?: string): McpGrantRejection {
		if (oauthError && TERMINAL_ERRORS.has(oauthError)) return "reauth-required";
		if (status === 429 || status >= 500) return "transient";
		if (status === 400 || status === 401 || status === 403) return "reauth-required";
		return "invalid-request";
	}
}
