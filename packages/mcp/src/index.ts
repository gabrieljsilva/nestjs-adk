export type { McpTransportConfig } from "./lib/mcp-options";

// per-run servers: the integrations the end user connected
export { AdkMcpServer } from "./lib/adk-mcp-server";
export type { AdkMcpServerOptions } from "./lib/adk-mcp-server";
export { AdkMcpAuth, BearerAuth, credentialDigest, EnvAuth, HeaderAuth, OAuthAuth } from "./lib/mcp-auth";
export type {
	McpClientAuthMethod,
	McpClientInfo,
	McpCredential,
	McpTokens,
	OAuthAuthOptions,
} from "./lib/mcp-auth";
export { McpOAuth } from "./lib/mcp-oauth";
export type { McpOAuthFetchOptions } from "./lib/mcp-oauth";
export { McpOAuthClient } from "./lib/oauth/mcp-oauth-client";
export type { McpDiscovery, McpOAuthClientOptions } from "./lib/oauth/mcp-oauth-client";
export { McpTokenEndpoint } from "./lib/oauth/mcp-token-endpoint";
export type { McpTokenEndpointOptions } from "./lib/oauth/mcp-token-endpoint";
export { McpMetadataReader } from "./lib/oauth/mcp-metadata-reader";
export type { McpMetadataLookup } from "./lib/oauth/mcp-metadata-reader";
export { McpDiscoveryError } from "./lib/errors/mcp-discovery.error";
export { McpReauthRequiredError } from "./lib/errors/mcp-reauth-required.error";
export { McpTokenGrantError } from "./lib/errors/mcp-token-grant.error";
export type { McpGrantRejection } from "./lib/errors/mcp-token-grant.error";
export { assertSafeTarget, guardedFetch } from "./lib/mcp-target-guard";
export type { TargetTrust } from "./lib/mcp-target-guard";
export { McpBlockedTargetError } from "./lib/errors/mcp-blocked-target.error";
export { McpInvalidSourceNameError } from "./lib/errors/mcp-invalid-source-name.error";
export { McpToolFilter } from "./lib/mcp-tool-filter";
export { McpToolName } from "./lib/mcp-tool-name";

// the server side: what the application's controllers publish, at one path
export { McpController } from "@nestjs-adk/core";
export type { McpControllerOptions } from "@nestjs-adk/core";
export { McpServerModule } from "./lib/server/mcp-server.module";
export type { McpServerOptions } from "./lib/server/mcp-server-options";
export { McpActorResolver } from "./lib/server/mcp-actor-resolver";
export { McpRequest } from "./lib/server/mcp-request";
export { McpUnauthorizedError } from "./lib/server/errors/mcp-unauthorized.error";
export { McpToolAnnotations } from "./lib/server/mcp-tool-annotations";
