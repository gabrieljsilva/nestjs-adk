import { lookup } from "node:dns/promises";
import { isIP } from "node:net";
import { McpBlockedTargetError } from "./errors/mcp-blocked-target.error";

/**
 * How much a target is trusted: `user` refuses private, loopback and link-local addresses and
 * cleartext, `private-ok` allows a server on your own network.
 */
export type TargetTrust = "user" | "private-ok";

const MAX_REDIRECTS = 5;

/**
 * Refuses a URL an MCP connection must not reach, throwing `McpBlockedTargetError`. Every
 * address the hostname resolves to is checked, because a DNS name pointing at the metadata
 * endpoint is the same attack as naming it. A target the connection then dials is resolved
 * again, so DNS rebinding is not covered.
 */
export async function assertSafeTarget(rawUrl: string | URL, trust: TargetTrust): Promise<URL> {
	const url = typeof rawUrl === "string" ? new URL(rawUrl) : rawUrl;

	if (url.protocol !== "https:" && url.protocol !== "http:") {
		throw new McpBlockedTargetError(url.href, `protocol ${url.protocol} is not allowed`);
	}

	const addresses = await resolve(url.hostname);
	const priv = addresses.find(isPrivateAddress);

	if (priv !== undefined && trust === "user") {
		throw new McpBlockedTargetError(
			url.href,
			`"${url.hostname}" resolves to the private address ${priv}. Set allowPrivateNetwork: true only when this MCP server belongs to your own network.`,
		);
	}

	if (priv === undefined && url.protocol !== "https:") {
		throw new McpBlockedTargetError(url.href, "public servers must be served over https");
	}

	return url;
}

/**
 * An ordinary fetch behind `assertSafeTarget`, re-checking every redirect hop, for the calls the
 * OAuth flow makes to endpoints a server's own metadata named.
 */
export function guardedFetch(trust: TargetTrust): typeof fetch {
	return async (input, init) => {
		let url = await assertSafeTarget(toUrl(input), trust);

		for (let hop = 0; hop <= MAX_REDIRECTS; hop += 1) {
			const response = await fetch(new Request(url, init as RequestInit), { redirect: "manual" });
			const location = response.headers.get("location");
			if (!isRedirect(response.status) || !location) return response;
			url = await assertSafeTarget(new URL(location, url), trust);
		}

		throw new McpBlockedTargetError(url.href, `more than ${MAX_REDIRECTS} redirects`);
	};
}

function toUrl(input: string | URL | Request): URL {
	if (input instanceof Request) return new URL(input.url);
	return typeof input === "string" ? new URL(input) : input;
}

function isRedirect(status: number): boolean {
	return status === 301 || status === 302 || status === 303 || status === 307 || status === 308;
}

async function resolve(hostname: string): Promise<string[]> {
	const literal = hostname.startsWith("[") && hostname.endsWith("]") ? hostname.slice(1, -1) : hostname;
	if (isIP(literal)) return [literal];
	try {
		const answers = await lookup(literal, { all: true, verbatim: true });
		return answers.map((answer) => answer.address);
	} catch {
		return [];
	}
}

function isPrivateAddress(address: string): boolean {
	const v4 = extractIPv4(address);
	if (v4) {
		const [a = 0, b = 0] = v4;
		if (a === 0 || a === 10 || a === 127) return true;
		if (a === 169 && b === 254) return true;
		if (a === 172 && b >= 16 && b <= 31) return true;
		if (a === 192 && b === 168) return true;
		if (a === 100 && b >= 64 && b <= 127) return true;
		return false;
	}

	const v6 = address.toLowerCase();
	if (v6 === "::" || v6 === "::1") return true;
	return (
		v6.startsWith("fc") ||
		v6.startsWith("fd") ||
		v6.startsWith("fe8") ||
		v6.startsWith("fe9") ||
		v6.startsWith("fea") ||
		v6.startsWith("feb")
	);
}

function extractIPv4(address: string): number[] | undefined {
	if (isIP(address) === 4) return address.split(".").map(Number);

	const lower = address.toLowerCase();
	if (!lower.startsWith("::ffff:")) return undefined;
	const rest = lower.slice(7);
	if (isIP(rest) === 4) return rest.split(".").map(Number);

	const groups = rest.split(":");
	if (groups.length !== 2 || !groups.every((group) => /^[0-9a-f]{1,4}$/.test(group))) return undefined;
	const [high, low] = groups.map((group) => Number.parseInt(group, 16)) as [number, number];
	return [high >> 8, high & 0xff, low >> 8, low & 0xff];
}
