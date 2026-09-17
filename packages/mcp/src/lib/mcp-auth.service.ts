import { createHash } from "node:crypto";
import { Logger } from "@nestjs/common";
import { McpReauthRequiredError } from "./errors/mcp-reauth-required.error";
import { McpTokenGrantError } from "./errors/mcp-token-grant.error";
import type { TargetTrust } from "./mcp-target-guard.service";
import { McpTokenEndpoint } from "./oauth/mcp-token-endpoint.adapter";

const SEPARATOR = "\u0000";

/**
 * What an authentication method resolves to: headers for an http or sse transport, environment
 * variables for a stdio one.
 */
export interface McpCredential {
	headers?: Record<string, string>;
	env?: Record<string, string>;
}

/**
 * One user's tokens for one server. `scope` is what the provider actually granted, which may be
 * narrower than what was asked for, and `expiresAt` is what decides when a renewal is due.
 */
export interface McpTokens {
	accessToken: string;
	refreshToken?: string;
	expiresAt?: Date;
	scope?: string;
}

export type McpClientAuthMethod = "client_secret_post" | "client_secret_basic" | "none";

/**
 * A registered OAuth client, as it comes back from registration. Store all of it: `authMethod`
 * is how the token endpoint has to be called, `secretExpiresAt` is when the registration lapses,
 * and the registration fields are the only way to unregister the client later.
 */
export interface McpClientInfo {
	clientId: string;
	clientSecret?: string;
	tokenEndpoint: string;
	authMethod?: McpClientAuthMethod;
	secretExpiresAt?: Date;
	registrationAccessToken?: string;
	registrationClientUri?: string;
}

/**
 * How a connection proves who is calling. Extend it for a method this package does not ship;
 * `resolve` is called whenever a credential is needed, so renewal belongs inside it.
 *
 * `fingerprint` is abstract on purpose: it identifies the credential without revealing it, and
 * two users sharing one fingerprint share one connection and each other's access. Build it with
 * `credentialDigest` over the parts that actually distinguish the caller.
 */
export abstract class AdkMcpAuth {
	public abstract resolve(): Promise<McpCredential>;

	public abstract fingerprint(): string;
}

/**
 * A stable, non-reversible fingerprint over the parts that distinguish one credential from
 * another. Safe to log, and the same on every run for the same parts.
 */
export function credentialDigest(...parts: string[]): string {
	return createHash("sha256").update(parts.join(SEPARATOR)).digest("hex").slice(0, 16);
}

/**
 * A static token sent as `Authorization: Bearer <token>`. Nothing is renewed.
 */
export class BearerAuth extends AdkMcpAuth {
	public constructor(private readonly token: string) {
		super();
	}

	public resolve(): Promise<McpCredential> {
		return Promise.resolve({ headers: { Authorization: `Bearer ${this.token}` } });
	}

	public fingerprint(): string {
		return credentialDigest("bearer", this.token);
	}
}

/**
 * Whatever headers the server expects, sent as they are. Nothing is renewed.
 */
export class HeaderAuth extends AdkMcpAuth {
	public constructor(private readonly headers: Record<string, string>) {
		super();
	}

	public resolve(): Promise<McpCredential> {
		return Promise.resolve({ headers: { ...this.headers } });
	}

	public fingerprint(): string {
		return credentialDigest("header", stableEntries(this.headers));
	}
}

/**
 * Environment variables handed to a `stdio` server's process. Nothing is renewed.
 */
export class EnvAuth extends AdkMcpAuth {
	public constructor(private readonly env: Record<string, string>) {
		super();
	}

	public resolve(): Promise<McpCredential> {
		return Promise.resolve({ env: { ...this.env } });
	}

	public fingerprint(): string {
		return credentialDigest("env", stableEntries(this.env));
	}
}

function stableEntries(record: Record<string, string>): string {
	return Object.entries(record)
		.sort(([a], [b]) => a.localeCompare(b))
		.map(([key, value]) => `${key}=${value}`)
		.join(SEPARATOR);
}

/**
 * What `OAuthAuth` needs. `onRefresh` is where a renewed token is persisted, and without it the
 * renewal is used for this run and then lost. `client` is what makes a renewal possible at all,
 * `skewMs` renews that long before expiry, and `resource` names the RFC 8707 audience.
 */
export interface OAuthAuthOptions {
	tokens: McpTokens;
	client?: McpClientInfo;
	onRefresh?: (tokens: McpTokens) => void | Promise<void>;
	skewMs?: number;
	resource?: string;
	allowPrivateNetwork?: boolean;
	fetch?: typeof fetch;
}

const DEFAULT_SKEW_MS = 60_000;

/**
 * An OAuth access token that renews itself when it is about to expire, once per moment however
 * many calls are waiting.
 *
 * A renewal with nothing left to renew with raises `McpReauthRequiredError`, which the runtime
 * records as a reauth event rather than a failed run; a provider that merely refused for now
 * surfaces as `McpTokenGrantError` so nobody is sent through consent over a rate limit.
 */
export class OAuthAuth extends AdkMcpAuth {
	private readonly logger = new Logger(OAuthAuth.name);
	private tokens: McpTokens;
	private renewal?: Promise<void>;

	public constructor(private readonly options: OAuthAuthOptions) {
		super();
		this.tokens = options.tokens;
		if (options.tokens.refreshToken && !options.onRefresh) {
			this.logger.warn(
				"OAuthAuth has a refresh token but no onRefresh; renewals will be discarded, and a provider that rotates refresh tokens will fail on the next run.",
			);
		}
	}

	public async resolve(): Promise<McpCredential> {
		if (this.expiring()) {
			this.renewal ??= this.refresh().finally(() => {
				this.renewal = undefined;
			});
			await this.renewal;
		}
		return { headers: { Authorization: `Bearer ${this.tokens.accessToken}` } };
	}

	public fingerprint(): string {
		return credentialDigest("oauth", this.options.client?.clientId ?? "", this.tokens.accessToken);
	}

	private expiring(): boolean {
		if (!this.tokens.expiresAt) return false;
		const skew = this.options.skewMs ?? DEFAULT_SKEW_MS;
		return this.tokens.expiresAt.getTime() - skew <= Date.now();
	}

	private async refresh(): Promise<void> {
		const { refreshToken } = this.tokens;
		const client = this.options.client;
		if (!refreshToken || !client) throw new McpReauthRequiredError("access token expired and cannot be renewed");

		const trust: TargetTrust = this.options.allowPrivateNetwork ? "private-ok" : "user";
		const endpoint = new McpTokenEndpoint(client, { trust, fetch: this.options.fetch });

		try {
			this.tokens = await endpoint.renew(refreshToken, { resource: this.options.resource });
		} catch (error) {
			if (error instanceof McpTokenGrantError && error.rejection !== "reauth-required") throw error;
			if (error instanceof McpTokenGrantError) throw new McpReauthRequiredError(error.reason);
			throw error;
		}

		await this.options.onRefresh?.(this.tokens);
	}
}
