import { toolset } from "@nestjs-adk/core";

export { McpClient } from "./lib/mcp-client";
export { McpModule } from "./lib/mcp.module";
export type { McpModuleOptions, McpServerConfig, McpTransportConfig } from "./lib/mcp-options";

// per-run servers: the integrations the end user connected
export { AdkMcpServer } from "./lib/adk-mcp-server";
export type { AdkMcpServerOptions } from "./lib/adk-mcp-server";
export {
	AdkMcpAuth,
	BearerAuth,
	credentialDigest,
	EnvAuth,
	HeaderAuth,
	McpReauthRequiredError,
	OAuthAuth,
} from "./lib/mcp-auth";
export type { McpClientInfo, McpCredential, McpTokens, OAuthAuthOptions } from "./lib/mcp-auth";
export { McpDiscoveryError, McpOAuth } from "./lib/mcp-oauth";
export type { McpDiscovery, McpOAuthFetchOptions } from "./lib/mcp-oauth";
export { assertSafeTarget, guardedFetch } from "./lib/mcp-target-guard";
export type { TargetTrust } from "./lib/mcp-target-guard";

/** Semantic sugar over the core's `toolset()`: `@Agent({ tools: [mcpTools('github', ['create_issue'])] })`. */
export const mcpTools = toolset;
