import { McpBlockedTargetError } from "../errors/mcp-blocked-target.error";
import { type TargetTrust, guardedFetch } from "../mcp-target-guard.service";

/** What one lookup produced: a document, or the reason the first candidate could not serve one. */
export interface McpMetadataLookup {
	body?: Record<string, unknown>;
	failure?: string;
}

/**
 * Finds the well-known documents of the authorization flow.
 *
 * Where they live is the part of discovery that providers get to disagree about, so it is one
 * class: the candidates are ordered here, and a dialect nobody has met yet is a new entry in
 * `candidates` rather than a branch inside discovery.
 */
export class McpMetadataReader {
	public constructor(
		private readonly trust: TargetTrust = "user",
		private readonly call: typeof fetch = guardedFetch(trust),
	) {}

	/** The first candidate that answers with a document wins; a 404 means "not here, try the next". */
	public async read(target: URL, names: string[]): Promise<McpMetadataLookup> {
		let firstFailure: string | undefined;
		for (const candidate of McpMetadataReader.candidates(target, names)) {
			const found = await this.fetchOne(candidate);
			if (found.body) return found;
			firstFailure ??= found.failure;
		}
		return { failure: firstFailure };
	}

	/**
	 * Where a well-known document may live, most specific first. RFC 8414 §3.1 and RFC 9728 insert
	 * the path of the issuer or resource AFTER the well-known segment, so a server mounted on `/mcp`
	 * publishes at `/.well-known/oauth-protected-resource/mcp` and legitimately answers 404 at the
	 * root. Asking the path-inserted location first also matters on a shared host, where the root
	 * document describes somebody else's tenant.
	 */
	public static candidates(target: URL, names: string[]): URL[] {
		const path = target.pathname.replace(/\/+$/, "");
		const candidates: URL[] = [];
		for (const name of names) {
			if (path) candidates.push(new URL(`/.well-known/${name}${path}`, target));
			// OpenID Connect Discovery is the one dialect that APPENDS the path instead of inserting it:
			// `{issuer}/.well-known/openid-configuration`. A provider mounted on a path publishes there.
			if (path && name === "openid-configuration") candidates.push(new URL(`${path}/.well-known/${name}`, target));
			candidates.push(new URL(`/.well-known/${name}`, target));
		}
		return candidates;
	}

	private async fetchOne(url: URL): Promise<McpMetadataLookup> {
		try {
			const response = await this.call(url, { headers: { accept: "application/json" } });
			if (response.status === 404) return {};
			if (!response.ok) return { failure: `${url.origin} answered ${response.status}` };
			return { body: (await response.json()) as Record<string, unknown> };
		} catch (error) {
			// A blocked target is a refusal, not an unreachable server: folding it into `failure` would
			// report an SSRF attempt as a network hiccup.
			if (error instanceof McpBlockedTargetError) throw error;
			return { failure: `${url.origin} is unreachable: ${error instanceof Error ? error.message : String(error)}` };
		}
	}
}
