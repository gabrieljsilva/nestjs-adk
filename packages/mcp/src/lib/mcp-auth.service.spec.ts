import { Logger } from "@nestjs/common";
import { McpBlockedTargetError } from "./errors/mcp-blocked-target.error";
import { McpReauthRequiredError } from "./errors/mcp-reauth-required.error";
import { McpTokenGrantError } from "./errors/mcp-token-grant.error";
import { BearerAuth, EnvAuth, HeaderAuth, OAuthAuth } from "./mcp-auth.service";

const CLIENT = { clientId: "client-1", clientSecret: "secret-1", tokenEndpoint: "https://auth.example.com/token" };

function inMinutes(minutes: number): Date {
	return new Date(Date.now() + minutes * 60_000);
}

/**
 * A real `Response` per call, never a literal: renewal goes through the target guard, which reads
 * the headers of what came back to decide whether it is a redirect. A hand-made object passes the
 * assertion and proves nothing about the path the credential actually takes.
 */
function answers(payload: Record<string, unknown>, status = 200) {
	const fetchSpy = vi.fn(
		async () => new Response(JSON.stringify(payload), { status, headers: { "content-type": "application/json" } }),
	);
	vi.stubGlobal("fetch", fetchSpy);
	return fetchSpy;
}

describe("static credentials", () => {
	it("bearer becomes an Authorization header", async () => {
		expect(await new BearerAuth("abc").resolve()).toEqual({ headers: { Authorization: "Bearer abc" } });
	});

	it("header auth passes the headers through for servers that want another one", async () => {
		expect(await new HeaderAuth({ "X-Api-Key": "k" }).resolve()).toEqual({ headers: { "X-Api-Key": "k" } });
	});

	/**
	 * A secret on the command line shows up in `ps`; the environment does not.
	 */
	it("env auth targets the process transport instead of headers", async () => {
		const credential = await new EnvAuth({ GITHUB_TOKEN: "t" }).resolve();

		expect(credential).toEqual({ env: { GITHUB_TOKEN: "t" } });
	});
});

describe("OAuthAuth", () => {
	afterEach(() => {
		vi.unstubAllGlobals();
		vi.restoreAllMocks();
	});

	it("uses the access token while it is still valid", async () => {
		const fetchSpy = vi.fn();
		vi.stubGlobal("fetch", fetchSpy);
		const auth = new OAuthAuth({ tokens: { accessToken: "still-good", expiresAt: inMinutes(30) }, client: CLIENT });

		expect(await auth.resolve()).toEqual({ headers: { Authorization: "Bearer still-good" } });
		expect(fetchSpy).not.toHaveBeenCalled();
	});

	it("treats a token with no expiry as usable", async () => {
		const auth = new OAuthAuth({ tokens: { accessToken: "eternal" } });

		expect(await auth.resolve()).toEqual({ headers: { Authorization: "Bearer eternal" } });
	});

	/**
	 * Without reporting the renewal back, it dies with the run and the next one reads the stale
	 * token again.
	 */
	it("renews an expired token and reports the new one back", async () => {
		answers({ access_token: "fresh", refresh_token: "rotated", expires_in: 3600 });
		const saved: unknown[] = [];
		const auth = new OAuthAuth({
			tokens: { accessToken: "stale", refreshToken: "old", expiresAt: inMinutes(-5) },
			client: CLIENT,
			onRefresh: (tokens) => void saved.push(tokens),
		});

		expect(await auth.resolve()).toEqual({ headers: { Authorization: "Bearer fresh" } });
		expect(saved).toHaveLength(1);
		expect(saved[0]).toMatchObject({ accessToken: "fresh", refreshToken: "rotated" });
	});

	it("renews shortly before expiry, so a long turn does not expire mid-call", async () => {
		const fetchSpy = answers({ access_token: "fresh" });
		const auth = new OAuthAuth({
			tokens: { accessToken: "stale", refreshToken: "old", expiresAt: new Date(Date.now() + 10_000) },
			client: CLIENT,
		});

		await auth.resolve();

		expect(fetchSpy).toHaveBeenCalledTimes(1);
	});

	/**
	 * Dropping the previous refresh token would lock the user out on the following run.
	 */
	it("keeps the previous refresh token when the provider does not rotate it", async () => {
		answers({ access_token: "fresh" });
		const saved: Array<{ refreshToken?: string }> = [];
		const auth = new OAuthAuth({
			tokens: { accessToken: "stale", refreshToken: "keep-me", expiresAt: inMinutes(-1) },
			client: CLIENT,
			onRefresh: (tokens) => void saved.push(tokens),
		});

		await auth.resolve();

		expect(saved[0]?.refreshToken).toBe("keep-me");
	});

	it("renews only once, then reuses the token it obtained", async () => {
		const fetchSpy = answers({ access_token: "fresh", expires_in: 3600 });
		const auth = new OAuthAuth({
			tokens: { accessToken: "stale", refreshToken: "old", expiresAt: inMinutes(-1) },
			client: CLIENT,
		});

		await auth.resolve();
		await auth.resolve();

		expect(fetchSpy).toHaveBeenCalledTimes(1);
	});

	/**
	 * Two renewals would send the same refresh token twice, and a rotating provider rejects the
	 * second.
	 */
	it("shares one renewal between concurrent callers", async () => {
		const fetchSpy = answers({ access_token: "fresh", refresh_token: "rotated", expires_in: 3600 });
		const auth = new OAuthAuth({
			tokens: { accessToken: "stale", refreshToken: "old", expiresAt: inMinutes(-1) },
			client: CLIENT,
		});

		await Promise.all([auth.resolve(), auth.resolve()]);

		expect(fetchSpy).toHaveBeenCalledTimes(1);
	});

	it("asks for re-authorization when there is no refresh token", async () => {
		const auth = new OAuthAuth({ tokens: { accessToken: "stale", expiresAt: inMinutes(-1) }, client: CLIENT });

		await expect(auth.resolve()).rejects.toBeInstanceOf(McpReauthRequiredError);
	});

	it("asks for re-authorization when the client was never registered", async () => {
		const auth = new OAuthAuth({ tokens: { accessToken: "stale", refreshToken: "r", expiresAt: inMinutes(-1) } });

		await expect(auth.resolve()).rejects.toBeInstanceOf(McpReauthRequiredError);
	});

	it("asks for re-authorization when the provider rejects the refresh", async () => {
		answers({ error: "invalid_grant", error_description: "refresh token is invalid" }, 400);
		const auth = new OAuthAuth({
			tokens: { accessToken: "stale", refreshToken: "revoked", expiresAt: inMinutes(-1) },
			client: CLIENT,
		});

		await expect(auth.resolve()).rejects.toBeInstanceOf(McpReauthRequiredError);
	});

	/**
	 * The credential is intact and the next run will very likely open. Reporting this as "sign in
	 * again" both sends the user through consent for nothing and has the application discard a
	 * refresh token that still works.
	 */
	it("does not ask for re-authorization when the provider was merely rate limited", async () => {
		answers({ error: "slow_down" }, 429);
		const auth = new OAuthAuth({
			tokens: { accessToken: "stale", refreshToken: "good", expiresAt: inMinutes(-1) },
			client: CLIENT,
		});

		await expect(auth.resolve()).rejects.toBeInstanceOf(McpTokenGrantError);
	});

	it("does not ask for re-authorization when the provider is broken", async () => {
		answers({}, 502);
		const auth = new OAuthAuth({
			tokens: { accessToken: "stale", refreshToken: "good", expiresAt: inMinutes(-1) },
			client: CLIENT,
		});

		await expect(auth.resolve()).rejects.toBeInstanceOf(McpTokenGrantError);
	});

	/**
	 * The token endpoint came out of the server's own metadata, so it is untrusted input like any
	 * other address the flow reaches: renewal used to be the one request that skipped the guard.
	 */
	it("refuses to renew against a private address unless it was allowed", async () => {
		answers({ access_token: "fresh" });
		const auth = new OAuthAuth({
			tokens: { accessToken: "stale", refreshToken: "good", expiresAt: inMinutes(-1) },
			client: { clientId: "c", tokenEndpoint: "http://127.0.0.1:9999/token" },
		});

		await expect(auth.resolve()).rejects.toBeInstanceOf(McpBlockedTargetError);
	});

	it("renews against a private address when the operator allowed it", async () => {
		answers({ access_token: "fresh" });
		const auth = new OAuthAuth({
			tokens: { accessToken: "stale", refreshToken: "good", expiresAt: inMinutes(-1) },
			client: { clientId: "c", tokenEndpoint: "http://127.0.0.1:9999/token" },
			allowPrivateNetwork: true,
		});

		expect(await auth.resolve()).toEqual({ headers: { Authorization: "Bearer fresh" } });
	});

	/**
	 * Silent discarding is the failure mode we cannot let a developer discover in production.
	 */
	it("warns when a refresh token arrives with nowhere to save the renewal", () => {
		const warn = vi.spyOn(Logger.prototype, "warn").mockImplementation(() => undefined);

		new OAuthAuth({ tokens: { accessToken: "a", refreshToken: "r" }, client: CLIENT });

		expect(warn).toHaveBeenCalled();
	});
});
