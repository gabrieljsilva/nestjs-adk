export type { McpTransportConfig } from "./lib/mcp.options";

export { AdkMcpServer } from "./lib/adk-mcp-server.adapter";
export type { AdkMcpServerOptions } from "./lib/adk-mcp-server.adapter";
export { AdkMcpAuth, BearerAuth, credentialDigest, EnvAuth, HeaderAuth, OAuthAuth } from "./lib/mcp-auth.service";
export type {
	McpClientAuthMethod,
	McpClientInfo,
	McpCredential,
	McpTokens,
	OAuthAuthOptions,
} from "./lib/mcp-auth.service";
export { McpOAuth } from "./lib/mcp-oauth.service";
export type { McpOAuthFetchOptions } from "./lib/mcp-oauth.service";
export { McpOAuthClient } from "./lib/oauth/mcp-oauth-client.adapter";
export type { McpDiscovery, McpOAuthClientOptions } from "./lib/oauth/mcp-oauth-client.adapter";
export { McpTokenEndpoint } from "./lib/oauth/mcp-token-endpoint.adapter";
export type { McpTokenEndpointOptions } from "./lib/oauth/mcp-token-endpoint.adapter";
export { McpMetadataReader } from "./lib/oauth/mcp-metadata-reader.adapter";
export type { McpMetadataLookup } from "./lib/oauth/mcp-metadata-reader.adapter";
export { McpDiscoveryError } from "./lib/errors/mcp-discovery.error";
export { McpReauthRequiredError } from "./lib/errors/mcp-reauth-required.error";
export { McpTokenGrantError } from "./lib/errors/mcp-token-grant.error";
export type { McpGrantRejection } from "./lib/errors/mcp-token-grant.error";
export { assertSafeTarget, guardedFetch } from "./lib/mcp-target-guard.service";
export type { TargetTrust } from "./lib/mcp-target-guard.service";
export { McpBlockedTargetError } from "./lib/errors/mcp-blocked-target.error";
export { McpInvalidSourceNameError } from "./lib/errors/mcp-invalid-source-name.error";
export { McpToolFilter } from "./lib/mcp-tool-filter.service";
export { McpToolName } from "./lib/mcp-tool-name.value-object";

export { McpController } from "@nestjs-adk/core";
export type { McpControllerOptions } from "@nestjs-adk/core";
export { McpServerModule } from "./lib/server/mcp-server.module";
export type { McpServerOptions } from "./lib/server/mcp-server.options";
export { McpActorResolver } from "./lib/server/mcp-actor-resolver.contract";
export { McpRequest } from "./lib/server/mcp-request.value-object";
export { McpUnauthorizedError } from "./lib/server/errors/mcp-unauthorized.error";
export { McpToolAnnotations } from "./lib/server/mcp-tool-annotations.value-object";
