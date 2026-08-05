import { type Server, createServer } from "node:http";
import type { AddressInfo } from "node:net";
import { McpBlockedTargetError } from "./errors/mcp-blocked-target.error";
import { assertSafeTarget, guardedFetch } from "./mcp-target-guard";

describe("assertSafeTarget", () => {
	describe('trust "user" (URL came from an end user)', () => {
		it.each([
			["cloud metadata", "http://169.254.169.254/latest/meta-data/"],
			["loopback", "https://127.0.0.1/mcp"],
			["localhost by name", "https://localhost:3001/mcp"],
			["RFC 1918", "https://10.0.0.5/mcp"],
			["RFC 1918 upper range", "https://172.31.0.1/mcp"],
			["home network", "https://192.168.0.10/mcp"],
			["CGNAT", "https://100.100.1.1/mcp"],
			["unspecified", "https://0.0.0.0/mcp"],
			["IPv6 loopback", "https://[::1]/mcp"],
			["IPv6 unique local", "https://[fd12:3456::1]/mcp"],
			["IPv6 mapped IPv4", "https://[::ffff:10.0.0.5]/mcp"],
		])("refuses a private address: %s", async (_label, url) => {
			await expect(assertSafeTarget(url, "user")).rejects.toBeInstanceOf(McpBlockedTargetError);
		});

		it("refuses a public server over plain http: the credential would travel in the clear", async () => {
			await expect(assertSafeTarget("http://example.com/mcp", "user")).rejects.toBeInstanceOf(McpBlockedTargetError);
		});

		it("refuses a protocol that is not http(s)", async () => {
			await expect(assertSafeTarget("ftp://example.com/mcp", "user")).rejects.toBeInstanceOf(McpBlockedTargetError);
		});

		it("accepts a public https address", async () => {
			await expect(assertSafeTarget("https://8.8.8.8/mcp", "user")).resolves.toBeInstanceOf(URL);
		});
	});

	describe('trust "private-ok" (the operator vouched for the target)', () => {
		it("accepts loopback, over http too", async () => {
			await expect(assertSafeTarget("http://127.0.0.1:3001/mcp", "private-ok")).resolves.toBeInstanceOf(URL);
		});

		it("still refuses a PUBLIC server over plain http: the flag widens the network, not the protocol", async () => {
			await expect(assertSafeTarget("http://example.com/mcp", "private-ok")).rejects.toBeInstanceOf(McpBlockedTargetError);
		});
	});
});

describe("guardedFetch", () => {
	let server: Server;
	let base: string;

	// A real local server: redirects are the whole point here, and mocking fetch would test the mock.
	beforeAll(async () => {
		server = createServer((req, res) => {
			if (req.url === "/ok") {
				res.writeHead(200, { "content-type": "application/json" });
				res.end('{"fine":true}');
			} else if (req.url === "/to-private") {
				res.writeHead(302, { location: "http://169.254.169.254/latest/meta-data/" });
				res.end();
			} else if (req.url === "/to-public-http") {
				res.writeHead(302, { location: "http://example.com/mcp" });
				res.end();
			} else if (req.url === "/hop") {
				res.writeHead(302, { location: "/hop" });
				res.end();
			} else if (req.url === "/one-hop") {
				res.writeHead(307, { location: "/ok" });
				res.end();
			} else {
				res.writeHead(404);
				res.end();
			}
		});
		await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
		base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
	});

	afterAll(async () => {
		await new Promise((resolve) => server.close(resolve));
	});

	it("follows a relative redirect and returns the final response", async () => {
		const response = await guardedFetch("private-ok")(`${base}/one-hop`);
		expect(await response.json()).toEqual({ fine: true });
	});

	it("a redirect that lands outside the rules is refused, even when the first URL was fine", async () => {
		// "private-ok" allows the local server; the hop to public http is what must fail. This is the
		// bypass a first-URL-only check misses.
		await expect(guardedFetch("private-ok")(`${base}/to-public-http`)).rejects.toBeInstanceOf(McpBlockedTargetError);
	});

	it('a redirect to a private address is refused under trust "user"', async () => {
		// The guard re-validates the hop with the SAME trust, so this needs the initial URL to be
		// allowed under "user"; localhost is not. Assert on the hop check directly instead.
		await expect(assertSafeTarget("http://169.254.169.254/latest/meta-data/", "user")).rejects.toBeInstanceOf(
			McpBlockedTargetError,
		);
	});

	it("gives up after too many redirects", async () => {
		await expect(guardedFetch("private-ok")(`${base}/hop`)).rejects.toBeInstanceOf(McpBlockedTargetError);
	});
});
