import { McpBlockedTargetError } from "../errors/mcp-blocked-target.error";
import { type TargetTrust, guardedFetch } from "../mcp-target-guard.service";

/**
 * What one well-known lookup answered: the document, or why it could not be read.
 */
export interface McpMetadataLookup {
	body?: Record<string, unknown>;
	failure?: string;
}

/**
 * Reads a server's well-known documents, trying each address the specification allows for the
 * target's path. Every request goes through the SSRF guard.
 */
export class McpMetadataReader {
	public constructor(
		private readonly trust: TargetTrust = "user",
		private readonly call: typeof fetch = guardedFetch(trust),
	) {}

	public async read(target: URL, names: string[]): Promise<McpMetadataLookup> {
		let firstFailure: string | undefined;
		for (const candidate of McpMetadataReader.candidates(target, names)) {
			const found = await this.fetchOne(candidate);
			if (found.body) return found;
			firstFailure ??= found.failure;
		}
		return { failure: firstFailure };
	}

	public static candidates(target: URL, names: string[]): URL[] {
		const path = target.pathname.replace(/\/+$/, "");
		const candidates: URL[] = [];
		for (const name of names) {
			if (path) candidates.push(new URL(`/.well-known/${name}${path}`, target));
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
			if (error instanceof McpBlockedTargetError) throw error;
			return { failure: `${url.origin} is unreachable: ${error instanceof Error ? error.message : String(error)}` };
		}
	}
}
