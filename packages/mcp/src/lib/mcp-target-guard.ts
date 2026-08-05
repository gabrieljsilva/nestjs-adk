import { lookup } from "node:dns/promises";
import { isIP } from "node:net";
import { McpBlockedTargetError } from "./errors/mcp-blocked-target.error";

/**
 * How much a URL that reaches the network is trusted. `"user"` is the default for anything a
 * per-run source connects to: the URL came from an end user, so private addresses are refused and
 * public targets must speak https. `"private-ok"` keeps the https rule for public targets but
 * allows loopback, private and link-local addresses (a local dev server, an internal corporate
 * MCP), over http too: on the operator's own network, cleartext exposes nothing to a third party.
 */
export type TargetTrust = "user" | "private-ok";

const MAX_REDIRECTS = 5;

/**
 * Refuses URLs a user-supplied address must not reach. Resolves the hostname and checks every
 * address it answers with, because `169.254.169.254`, `localhost` and a DNS name pointing at
 * either are the same attack written three ways.
 *
 * Known limit, on purpose: the connection that follows still dials the hostname, so a DNS name
 * that answers differently on the second query (rebinding) is not covered. Closing that requires
 * pinning the resolved address in the dialer, which is planned; do not present this guard as if
 * it covered it.
 */
export async function assertSafeTarget(rawUrl: string | URL, trust: TargetTrust): Promise<URL> {
	const url = typeof rawUrl === "string" ? new URL(rawUrl) : rawUrl;

	if (url.protocol !== "https:" && url.protocol !== "http:") {
		throw new McpBlockedTargetError(url.href, `protocol ${url.protocol} is not allowed`);
	}

	// A name that does not resolve is treated as public: there is no address to protect, the
	// connection that follows will fail on the same resolver, and blocking it here would turn every
	// DNS hiccup into a security refusal. The window where it resolves differently at connect time
	// is DNS rebinding, which this guard already documents as not covered.
	const addresses = await resolve(url.hostname);
	const priv = addresses.find(isPrivateAddress);

	if (priv !== undefined && trust === "user") {
		throw new McpBlockedTargetError(
			url.href,
			`"${url.hostname}" resolves to the private address ${priv}. Set allowPrivateNetwork: true only when this MCP server belongs to your own network.`,
		);
	}

	// A public server over cleartext would carry the user's credential for anyone on the path to
	// read. There is no legitimate case, so there is no option: http is for private targets only.
	if (priv === undefined && url.protocol !== "https:") {
		throw new McpBlockedTargetError(url.href, "public servers must be served over https");
	}

	return url;
}

/**
 * `fetch` that runs every request, and every redirect hop, through `assertSafeTarget`. Native
 * fetch follows redirects on its own, and a public URL answering 302 to an internal address is
 * the classic way around a check that only looks at the first URL, so redirects are re-validated
 * here, manually.
 *
 * Shaped like fetch so it can be handed to the MCP SDK transports as their `fetch` option: that
 * places the guard on the whole connection, not only on the URL `open()` saw.
 */
export function guardedFetch(trust: TargetTrust): typeof fetch {
	return async (input, init) => {
		let url = await assertSafeTarget(toUrl(input), trust);

		for (let hop = 0; hop <= MAX_REDIRECTS; hop += 1) {
			const response = await fetch(new Request(url, init as RequestInit), { redirect: "manual" });
			const location = response.headers.get("location");
			if (!isRedirect(response.status) || !location) return response;
			// Undici forbids reading the target of a manual redirect through response.url, so the hop is
			// rebuilt from the Location header, relative URLs included.
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

/** Every address the name answers with; an IP literal short-circuits, brackets stripped for IPv6. */
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

/** Loopback, RFC 1918, link-local, CGNAT, unspecified; IPv6 mapped forms unwrap to their IPv4. */
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
	// fc00::/7 (unique local) and fe80::/10 (link-local)
	return (
		v6.startsWith("fc") ||
		v6.startsWith("fd") ||
		v6.startsWith("fe8") ||
		v6.startsWith("fe9") ||
		v6.startsWith("fea") ||
		v6.startsWith("feb")
	);
}

/**
 * The IPv4 octets of a plain address or of an IPv6-mapped one. The mapped form arrives two ways:
 * dotted (`::ffff:10.0.0.1`) or, after URL canonicalization, hexadecimal (`::ffff:a00:1`), and
 * both name the same target.
 */
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
