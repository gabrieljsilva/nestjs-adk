import { createHash } from "node:crypto";
import { Logger } from "@nestjs/common";
import { McpReauthRequiredError } from "./errors/mcp-reauth-required.error";
import { McpTokenGrantError } from "./errors/mcp-token-grant.error";
import type { TargetTrust } from "./mcp-target-guard.service";
import { McpTokenEndpoint } from "./oauth/mcp-token-endpoint.adapter";

/**
 * Separator between the parts of a digest, written as an escape rather than as a literal byte.
 *
 * A byte no credential can contain is what keeps two different inputs from hashing the same:
 * without it `("a", "bc")` and `("ab", "c")` are one string. It stays an escape because a literal
 * NUL in the source makes every tool that sniffs for binary content, `grep` and `git diff` among
 * them, go silent on this whole file.
 */
const SEPARATOR = "\u0000";

/**
 * A resolved credential, already shaped for whichever transport will carry it: headers travel over
 * HTTP and SSE, environment variables reach a local process.
 */
export interface McpCredential {
	headers?: Record<string, string>;
	env?: Record<string, string>;
}

/** What an OAuth exchange answered, as this package keeps it between runs. */
export interface McpTokens {
	accessToken: string;
	refreshToken?: string;
	/** Absent means "no expiry known"; the token is used until the server rejects it. */
	expiresAt?: Date;
	/**
	 * What the provider actually granted, which is not always what was asked for: it may narrow the
	 * request, and the difference is what an application shows next to the integration.
	 */
	scope?: string;
}

/** How the client authenticates at the token endpoint, as settled during registration. */
export type McpClientAuthMethod = "client_secret_post" | "client_secret_basic" | "none";

/** The client half of an OAuth registration, kept so a refresh needs no rediscovery. */
export interface McpClientInfo {
	clientId: string;
	clientSecret?: string;
	/** Where to exchange and refresh, kept with the client so a refresh needs no rediscovery. */
	tokenEndpoint: string;
	/** Defaults to `client_secret_post` when the registration settled on nothing. */
	authMethod?: McpClientAuthMethod;
	/**
	 * When the client secret stops being accepted. Absent means never, which is what a provider says
	 * by answering zero. Storing it is what turns a lapsed registration into something an operator
	 * can see coming, instead of every renewal failing at once months later.
	 */
	secretExpiresAt?: Date;
	/** RFC 7592 credentials, kept to be able to delete this registration later. */
	registrationAccessToken?: string;
	registrationClientUri?: string;
}

/**
 * How a server proves who is calling. Renewal is a property of the method, not a policy of the
 * library: a static bearer token has nothing to renew, while OAuth does, which is why this is a
 * contract and not a flag.
 */
export abstract class AdkMcpAuth {
	/** A credential valid right now. Throws McpReauthRequiredError when only the user can fix it. */
	public abstract resolve(): Promise<McpCredential>;

	/**
	 * A stable, non-reversible identity for this credential, used to tell two connections to the same
	 * server apart when the application supplies no id of its own.
	 *
	 * Abstract rather than inferred from the object's fields: deriving it by serialization looks like
	 * it works, because TypeScript's `private` leaves properties enumerable, and then silently returns
	 * the same value for every instance of an implementation that uses real private fields. Two users
	 * would collapse into one connection, and one would run tools with the other's credential. A
	 * missing method breaks the build; a wrong fingerprint breaks nothing until it matters.
	 */
	public abstract fingerprint(): string;
}

/** Hashed, never stored: the digest identifies a connection and a leaked log line reveals nothing. */
export function credentialDigest(...parts: string[]): string {
	return createHash("sha256").update(parts.join(SEPARATOR)).digest("hex").slice(0, 16);
}

/** The common case: a token the server expects as `Authorization: Bearer`. */
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

/** For servers that want the credential somewhere other than `Authorization`. */
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

/** For `stdio`: the secret reaches the child process as environment, never as an argument. */
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

/** Sorted so that the same pairs in a different insertion order stay the same connection. */
function stableEntries(record: Record<string, string>): string {
	return Object.entries(record)
		.sort(([a], [b]) => a.localeCompare(b))
		.map(([key, value]) => `${key}=${value}`)
		.join(SEPARATOR);
}

export interface OAuthAuthOptions {
	tokens: McpTokens;
	/** From the dynamic registration: needed to refresh. Without it, an expired token is terminal. */
	client?: McpClientInfo;
	/**
	 * Where a renewed token goes. Without it the refresh happens and is lost: the next run reads the
	 * old token from your database, and a provider that rotates refresh tokens breaks for good.
	 */
	onRefresh?: (tokens: McpTokens) => void | Promise<void>;
	/** Renew this many milliseconds before expiry, so a long run does not expire mid-conversation. */
	skewMs?: number;
	/** RFC 8707 audience to renew for, when the provider scopes tokens to one resource. */
	resource?: string;
	/**
	 * Allows renewing against a private, loopback or link-local address. Default `false`, matching
	 * the source's own guard: a token endpoint is reached over the network like any other target.
	 */
	allowPrivateNetwork?: boolean;
	/**
	 * Replaces the guarded fetch used to renew. A substitute owns the SSRF guard the default applies.
	 */
	fetch?: typeof fetch;
}

/** Renewal is attempted this early, so a token does not expire between resolving and calling. */
const DEFAULT_SKEW_MS = 60_000;

/**
 * OAuth 2.0 with refresh. Renews when the token is expired or about to be, hands the new tokens to
 * `onRefresh`, and gives up with McpReauthRequiredError when only the user can resolve it.
 */
export class OAuthAuth extends AdkMcpAuth {
	private readonly logger = new Logger(OAuthAuth.name);
	private tokens: McpTokens;
	/** In-flight renewal, shared by concurrent callers. */
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
		// Sources open in parallel, so one instance shared by two of them would fire two renewals. With a
		// provider that rotates refresh tokens the second one arrives with a token already invalidated by
		// the first, and the connection breaks for good. Callers share the renewal already in flight.
		if (this.expiring()) {
			this.renewal ??= this.refresh().finally(() => {
				this.renewal = undefined;
			});
			await this.renewal;
		}
		return { headers: { Authorization: `Bearer ${this.tokens.accessToken}` } };
	}

	public fingerprint(): string {
		// Derived from the token in hand, so it also changes on an ordinary renewal, not only on a
		// re-authorization. That is acceptable because nothing is cached between runs, but it is why an
		// application that wants a stable connection key should pass its own `id`.
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
			// A rate limited or briefly broken provider revoked nothing. Letting that surface as
			// "authorize again" would send the user through consent because the provider had a bad
			// minute, and would have the application discard a credential that still works.
			if (error instanceof McpTokenGrantError && error.rejection !== "reauth-required") throw error;
			if (error instanceof McpTokenGrantError) throw new McpReauthRequiredError(error.reason);
			throw error;
		}

		await this.options.onRefresh?.(this.tokens);
	}
}
