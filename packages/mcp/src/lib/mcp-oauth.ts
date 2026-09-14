import type { McpClientInfo, McpTokens } from "./mcp-auth";
import { type McpDiscovery, McpOAuthClient } from "./oauth/mcp-oauth-client";

/**
 * Per-call configuration of the flow's network access.
 *
 * Every fetch of the OAuth flow goes through the target guard, not only discovery's first hop: the
 * endpoints later calls POST to came out of the server's own metadata, and a malicious server
 * naming `https://10.0.0.5/token` as its token endpoint is the same SSRF with one extra step.
 */
export interface McpOAuthFetchOptions {
	/** Allow endpoints on private, loopback or link-local addresses. Default `false`. */
	allowPrivateNetwork?: boolean;
}

/**
 * The authorization flow at its shortest, for the default configuration: public internet, no
 * custom client metadata, no substituted fetch. Build an `McpOAuthClient` for anything else.
 */
export const McpOAuth = {
	discover(serverUrl: string, options?: McpOAuthFetchOptions): Promise<McpDiscovery> {
		return new McpOAuthClient(options).discover(serverUrl);
	},

	register(
		discovery: McpDiscovery,
		options: { redirectUri: string; clientName: string } & McpOAuthFetchOptions,
	): Promise<McpClientInfo> {
		return new McpOAuthClient(options).register(discovery, options);
	},

	authorize(
		discovery: McpDiscovery,
		client: McpClientInfo,
		options: { redirectUri: string; scopes?: string[]; state?: string; resource?: string },
	): { url: string; verifier: string; state: string } {
		return new McpOAuthClient().authorize(discovery, client, options);
	},

	exchange(
		client: McpClientInfo,
		options: { code: string; verifier: string; redirectUri: string; resource?: string } & McpOAuthFetchOptions,
	): Promise<McpTokens> {
		return new McpOAuthClient(options).exchange(client, options);
	},

	revoke(
		discovery: McpDiscovery,
		client: McpClientInfo,
		options: { token: string; tokenType?: "access_token" | "refresh_token" } & McpOAuthFetchOptions,
	): Promise<boolean> {
		return new McpOAuthClient(options).revoke(discovery, client, options);
	},
};
