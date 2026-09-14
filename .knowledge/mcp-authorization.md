---
title: MCP authorization
description: Where the OAuth flow is split, why a failed renewal is classified rather than reported, and what decides whether cleartext is allowed
type: pattern
tags: [mcp, oauth, security, errors]
---

Connecting a user to a server nobody configured by hand is the whole point of the MCP authorization flow, so everything the specifications fix lives in `packages/mcp/src/lib/oauth/` and nothing else does. Routes, sessions and where tokens are stored belong to the application.

## Three classes, split by what disagrees

`McpMetadataReader` owns where the well-known documents live, which is the part providers disagree about: a dialect nobody has met yet is a new entry in `candidates`, not a branch inside discovery.

`McpTokenEndpoint` owns every call a client makes to its token endpoint. The exchange, the renewal and the revocation differ by two form fields and share everything that is actually hard: the client authentication method, the two response dialects, and telling a dead credential from a provider having a bad minute. They were split once, and the renewal drifted: it read only JSON, classified every refusal as "sign in again" and skipped the SSRF guard.

`McpOAuthClient` is the flow, and `McpOAuth` is a stateless facade over its default configuration. Anything configurable, private networks, extra RFC 7591 metadata, preferred authentication methods, a substituted fetch, is a constructor option rather than a parameter threaded through five call sites.

## A refusal is classified, never assumed

A token endpoint saying no does not say what to do about it, and getting that wrong is expensive in both directions. `McpTokenGrantError.rejection` answers it:

- `"transient"`: 429 or 5xx. The provider revoked nothing. Reporting it as reauth sends the user through consent over a rate limit and has the application discard a refresh token that still works. It reaches the runtime as `ToolSourceUnavailableError`.
- `"reauth-required"`: `invalid_grant`, `invalid_client`, `unauthorized_client`, `access_denied`, or a bare 400, 401 or 403. RFC 6749 section 5.2 makes 400 the answer to a refused grant, so at a renewal it means the refresh token is spent even when the provider names no code. Becomes `McpReauthRequiredError`, and `ToolSourceAuthError`.
- `"invalid-request"`: anything else. The request was wrong, and retrying it will be wrong again.

The OAuth error code decides before the status, because it describes the grant while the status describes the HTTP call.

## Cleartext is the guard's decision, not discovery's

`assertSafeTarget` allows http only for an address that really resolves to a private range, and only when the caller asked for `"private-ok"`: on the operator's own network cleartext exposes nothing to a third party, and a public server over http has no legitimate case. Discovery used to refuse http unconditionally on top of that, which left an internal MCP server that the transport connects to happily unreachable by the flow that authorizes it. Discovery now refuses only under `"user"` trust and lets the guard rule on the rest, so `allowPrivateNetwork` means one thing across the package. See [[error-taxonomy]] for why the two failures are separate classes.

## What a registration is worth keeping

The whole `McpClientInfo`, not the id and the secret. `authMethod` is how the token endpoint has to be called and is not always what was asked for; `secretExpiresAt` is the only warning a registration is about to lapse, and without it the first sign is every renewal failing at once months later; `registrationAccessToken` and `registrationClientUri` are RFC 7592, and a client registered without keeping them can never be deleted.
