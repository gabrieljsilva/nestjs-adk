---
"@nestjs-adk/mcp": minor
---

MCP OAuth: renewal goes through the guard and stops lying about dead credentials, registration keeps what RFC 7591 and 7592 return, and the flow gained revocation and a client to configure it with.

Renewal was the one request in the package that called `fetch` directly. The token endpoint came out of the server's own metadata, so it is untrusted input like every other address the flow reaches: a server naming `https://10.0.0.5/token` had an unguarded request pointed at it every time a token expired. It now goes through `guardedFetch`, with `allowPrivateNetwork` and `fetch` on `OAuthAuthOptions` for the operator's own network and for a corporate proxy.

Every refusal of a renewal was reported as `McpReauthRequiredError`. A provider answering 429 or 502 revoked nothing, and marking the integration as disconnected over it sends the user through consent for nothing and has the application discard a refresh token that still works. Refusals are now classified: `McpTokenGrantError` carries a `rejection` of `"transient"`, `"reauth-required"` or `"invalid-request"`, decided by the OAuth error code first and the status second, and only the terminal one becomes `McpReauthRequiredError`. A transient one reaches the runtime as `ToolSourceUnavailableError` instead. `McpReauthRequiredError` is now an `AdkError` with the code `MCP_REAUTH_REQUIRED`.

`McpTokenEndpoint` is the exchange, the renewal and the revocation in one class, which is why they no longer disagree: the renewal read only JSON while the exchange read both dialects, and neither knew about client authentication methods other than `client_secret_post`. The method is now negotiated against the server's `token_endpoint_auth_methods_supported`, `client_secret_basic` included with the RFC 6749 section 2.3.1 encoding, and the registration's own answer wins over what was asked for. `grant_types` is likewise intersected with what the server announces, since asking for `refresh_token` where it is not offered is how a whole registration gets refused.

Registration keeps what it used to drop: `client_secret_expires_at` as `secretExpiresAt`, so a lapsed registration is something an operator can see coming rather than every renewal failing at once months later, and the RFC 7592 `registration_access_token` and `registration_client_uri`, without which a client this package created can never be deleted. `McpOAuthClient.unregister` deletes it. `McpTokens.scope` carries what the provider actually granted, which may be narrower than what was asked for.

`McpOAuth.revoke` hands a token back on uninstall, when the provider publishes a `revocation_endpoint`. Discovery now reads that endpoint, along with `token_endpoint_auth_methods_supported` and `grant_types_supported`.

`McpOAuthClient` is the flow as a class, for everything the stateless `McpOAuth` facade cannot take: private networks, extra RFC 7591 client metadata a particular provider asks for, a preferred order of client authentication methods, and a substituted fetch. `McpOAuth` keeps working unchanged.

Two fixes to what discovery answers. The RFC 8707 `resource` was reduced to the origin, which names a different resource on any server not mounted at the root: it is now the identifier the server publishes for itself, falling back to the whole URL, path included. And discovery refused plain HTTP unconditionally, while the target guard allows it for an address that really is private, which left a local MCP server reachable by the transport and unreachable by the flow that authorizes it. The refusal is now the guard's to make, so `allowPrivateNetwork` means the same thing everywhere.
