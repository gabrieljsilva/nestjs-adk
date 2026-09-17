import type { McpClientInfo, McpTokens } from "./mcp-auth.service";
import { type McpDiscovery, McpOAuthClient } from "./oauth/mcp-oauth-client.adapter";

/**
 * Whether a flow may reach a private, loopback or cleartext address. It defaults to `false`,
 * which is the SSRF guard.
 */
export interface McpOAuthFetchOptions {
	allowPrivateNetwork?: boolean;
}

/**
 * Getting a user authorized with an MCP server, on the defaults: discover, register, send them
 * to consent, exchange the code, and revoke on uninstall. It is stateless, because the routes,
 * the session and where tokens are stored are the application's.
 *
 * The whole `McpClientInfo` is worth storing, not only the id and secret, and the verifier from
 * `authorize` has to be kept server side next to `state` until the callback. Use
 * `McpOAuthClient` when the defaults do not fit.
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
