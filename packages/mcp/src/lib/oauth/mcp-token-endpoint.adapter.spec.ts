import type { McpClientInfo } from "../mcp-auth.service";
import { McpTokenEndpoint } from "./mcp-token-endpoint.adapter";

const CLIENT: McpClientInfo = { clientId: "c/1", clientSecret: "s:2", tokenEndpoint: "https://auth.example.com/token" };
const GRANT = { code: "abc", verifier: "v", redirectUri: "https://app.example.com/cb" };

function responds(body: string, init: { status?: number; type?: string } = {}) {
	return vi.fn(
		async (_input: Request | URL | string, _init?: RequestInit) =>
			new Response(body, {
				status: init.status ?? 200,
				headers: { "content-type": init.type ?? "application/json" },
			}),
	);
}

function lastInit(call: ReturnType<typeof responds>): RequestInit {
	const last = call.mock.calls.at(-1);
	if (!last) throw new Error("the endpoint was never called");
	return last[1] as RequestInit;
}

function sent(call: ReturnType<typeof responds>) {
	return new URLSearchParams(String(lastInit(call).body));
}

function headersSent(call: ReturnType<typeof responds>) {
	return new Headers(lastInit(call).headers);
}

describe("client authentication", () => {
	it("puts the secret in the body by default, which is what every provider here accepts", async () => {
		const call = responds(JSON.stringify({ access_token: "t" }));

		await new McpTokenEndpoint(CLIENT, { fetch: call }).exchange(GRANT);

		expect(sent(call).get("client_secret")).toBe("s:2");
		expect(headersSent(call).get("authorization")).toBeNull();
	});

	/**
	 * RFC 6749 §2.3.1: both halves are form-urlencoded before the colon, and a provider that decodes
	 * them gets "c/1" and "s:2" back rather than a split on the wrong colon.
	 */
	it("sends the secret as Basic when the registration settled on it", async () => {
		const call = responds(JSON.stringify({ access_token: "t" }));

		await new McpTokenEndpoint({ ...CLIENT, authMethod: "client_secret_basic" }, { fetch: call }).exchange(GRANT);

		const decoded = Buffer.from(headersSent(call).get("authorization")?.slice(6) ?? "", "base64").toString();
		expect(decoded).toBe("c%2F1:s%3A2");
		expect(sent(call).get("client_secret")).toBeNull();
		expect(sent(call).get("client_id")).toBeNull();
	});

	it("authenticates with nothing but the client id when there is no secret", async () => {
		const call = responds(JSON.stringify({ access_token: "t" }));

		await new McpTokenEndpoint({ clientId: "c", tokenEndpoint: CLIENT.tokenEndpoint }, { fetch: call }).exchange(GRANT);

		expect(sent(call).get("client_id")).toBe("c");
		expect(sent(call).get("client_secret")).toBeNull();
	});
});

describe("what the grant answered", () => {
	it("keeps the scope the provider granted, which may be narrower than the one asked for", async () => {
		const call = responds(JSON.stringify({ access_token: "t", scope: "read:board" }));

		const tokens = await new McpTokenEndpoint(CLIENT, { fetch: call }).exchange(GRANT);

		expect(tokens.scope).toBe("read:board");
	});

	it("reads a form-encoded renewal, the dialect GitHub answers in", async () => {
		const call = responds("access_token=gho_2&expires_in=28800", { type: "application/x-www-form-urlencoded" });

		const tokens = await new McpTokenEndpoint(CLIENT, { fetch: call }).renew("r");

		expect(tokens.accessToken).toBe("gho_2");
		expect(tokens.expiresAt).toBeInstanceOf(Date);
	});

	it("keeps the refresh token that was sent when the provider does not rotate it", async () => {
		const call = responds(JSON.stringify({ access_token: "t" }));

		const tokens = await new McpTokenEndpoint(CLIENT, { fetch: call }).renew("keep-me");

		expect(tokens.refreshToken).toBe("keep-me");
	});
});

describe("how a refusal is classified", () => {
	it.each([
		["invalid_grant", 400, "reauth-required"],
		["invalid_client", 401, "reauth-required"],
		[undefined, 400, "reauth-required"],
		["slow_down", 429, "transient"],
		[undefined, 503, "transient"],
		[undefined, 404, "invalid-request"],
	])("reads %s with %i as %s", async (error, status, rejection) => {
		const call = responds(JSON.stringify(error ? { error } : {}), { status });

		await expect(new McpTokenEndpoint(CLIENT, { fetch: call }).renew("r")).rejects.toMatchObject({ rejection });
	});

	/**
	 * A 429 revoked nothing, and a body naming an error does not change that: retrying is the whole
	 * difference between a minute of degraded tools and a user sent through consent for nothing.
	 */
	it("classifies a provider rate limit ahead of the OAuth code it happens to carry", async () => {
		const call = responds(JSON.stringify({ error: "invalid_request" }), { status: 429 });

		await expect(new McpTokenEndpoint(CLIENT, { fetch: call }).renew("r")).rejects.toMatchObject({
			rejection: "transient",
			isTransient: true,
		});
	});

	it("reports an OAuth error that rode in on a 200", async () => {
		const call = responds("error=bad_verification_code&error_description=The+code+expired", {
			type: "application/x-www-form-urlencoded",
		});

		await expect(new McpTokenEndpoint(CLIENT, { fetch: call }).exchange(GRANT)).rejects.toThrow(/code expired/i);
	});

	it("treats an unreachable provider as transient rather than as a dead credential", async () => {
		const call = vi.fn(async () => {
			throw new TypeError("fetch failed");
		});

		await expect(new McpTokenEndpoint(CLIENT, { fetch: call }).renew("r")).rejects.toMatchObject({
			rejection: "transient",
		});
	});
});

describe("revocation", () => {
	it("hands the token back with the hint the provider uses to find it", async () => {
		const call = responds("", { status: 200 });

		await new McpTokenEndpoint(CLIENT, { fetch: call }).revoke("https://auth.example.com/revoke", "r1", "refresh_token");

		expect(sent(call).get("token")).toBe("r1");
		expect(sent(call).get("token_type_hint")).toBe("refresh_token");
	});

	it("reports a refusal, which per RFC 7009 can only mean the request was wrong", async () => {
		const call = responds(JSON.stringify({ error: "unsupported_token_type" }), { status: 400 });

		await expect(
			new McpTokenEndpoint(CLIENT, { fetch: call }).revoke("https://auth.example.com/revoke", "r1"),
		).rejects.toThrow(/unsupported_token_type/);
	});
});
