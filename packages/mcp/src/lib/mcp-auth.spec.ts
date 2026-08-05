import { Logger } from "@nestjs/common";
import { BearerAuth, EnvAuth, HeaderAuth, McpReauthRequiredError, OAuthAuth } from "./mcp-auth";

const CLIENT = { clientId: "client-1", clientSecret: "secret-1", tokenEndpoint: "https://auth.example.com/token" };

function inMinutes(minutes: number): Date {
	return new Date(Date.now() + minutes * 60_000);
}

describe("static credentials", () => {
	it("bearer becomes an Authorization header", async () => {
		expect(await new BearerAuth("abc").resolve()).toEqual({ headers: { Authorization: "Bearer abc" } });
	});

	it("header auth passes the headers through for servers that want another one", async () => {
		expect(await new HeaderAuth({ "X-Api-Key": "k" }).resolve()).toEqual({ headers: { "X-Api-Key": "k" } });
	});

	it("env auth targets the process transport instead of headers", async () => {
		const credential = await new EnvAuth({ GITHUB_TOKEN: "t" }).resolve();

		// a secret on the command line shows up in `ps`; the environment does not
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

	it("renews an expired token and reports the new one back", async () => {
		vi.stubGlobal(
			"fetch",
			vi.fn().mockResolvedValue({
				ok: true,
				json: async () => ({ access_token: "fresh", refresh_token: "rotated", expires_in: 3600 }),
			}),
		);
		const saved: unknown[] = [];
		const auth = new OAuthAuth({
			tokens: { accessToken: "stale", refreshToken: "old", expiresAt: inMinutes(-5) },
			client: CLIENT,
			onRefresh: (tokens) => void saved.push(tokens),
		});

		expect(await auth.resolve()).toEqual({ headers: { Authorization: "Bearer fresh" } });
		// without this the renewal dies with the run and the next one reads the stale token again
		expect(saved).toHaveLength(1);
		expect(saved[0]).toMatchObject({ accessToken: "fresh", refreshToken: "rotated" });
	});

	it("renews shortly before expiry, so a long turn does not expire mid-call", async () => {
		const fetchSpy = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ access_token: "fresh" }) });
		vi.stubGlobal("fetch", fetchSpy);
		const auth = new OAuthAuth({
			tokens: { accessToken: "stale", refreshToken: "old", expiresAt: new Date(Date.now() + 10_000) },
			client: CLIENT,
		});

		await auth.resolve();

		expect(fetchSpy).toHaveBeenCalledTimes(1);
	});

	it("keeps the previous refresh token when the provider does not rotate it", async () => {
		vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, json: async () => ({ access_token: "fresh" }) }));
		const saved: Array<{ refreshToken?: string }> = [];
		const auth = new OAuthAuth({
			tokens: { accessToken: "stale", refreshToken: "keep-me", expiresAt: inMinutes(-1) },
			client: CLIENT,
			onRefresh: (tokens) => void saved.push(tokens),
		});

		await auth.resolve();

		// dropping it would lock the user out on the following run
		expect(saved[0]?.refreshToken).toBe("keep-me");
	});

	it("renews only once, then reuses the token it obtained", async () => {
		const fetchSpy = vi.fn().mockResolvedValue({
			ok: true,
			json: async () => ({ access_token: "fresh", expires_in: 3600 }),
		});
		vi.stubGlobal("fetch", fetchSpy);
		const auth = new OAuthAuth({
			tokens: { accessToken: "stale", refreshToken: "old", expiresAt: inMinutes(-1) },
			client: CLIENT,
		});

		await auth.resolve();
		await auth.resolve();

		expect(fetchSpy).toHaveBeenCalledTimes(1);
	});

	it("shares one renewal between concurrent callers", async () => {
		const fetchSpy = vi.fn().mockResolvedValue({
			ok: true,
			json: async () => ({ access_token: "fresh", refresh_token: "rotated", expires_in: 3600 }),
		});
		vi.stubGlobal("fetch", fetchSpy);
		const auth = new OAuthAuth({
			tokens: { accessToken: "stale", refreshToken: "old", expiresAt: inMinutes(-1) },
			client: CLIENT,
		});

		await Promise.all([auth.resolve(), auth.resolve()]);

		// two renewals would send the same refresh token twice, and a rotating provider rejects the second
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
		vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false, status: 400 }));
		const auth = new OAuthAuth({
			tokens: { accessToken: "stale", refreshToken: "revoked", expiresAt: inMinutes(-1) },
			client: CLIENT,
		});

		await expect(auth.resolve()).rejects.toBeInstanceOf(McpReauthRequiredError);
	});

	it("warns when a refresh token arrives with nowhere to save the renewal", () => {
		const warn = vi.spyOn(Logger.prototype, "warn").mockImplementation(() => undefined);

		new OAuthAuth({ tokens: { accessToken: "a", refreshToken: "r" }, client: CLIENT });

		// silent discarding is the failure mode we cannot let a developer discover in production
		expect(warn).toHaveBeenCalled();
	});
});
