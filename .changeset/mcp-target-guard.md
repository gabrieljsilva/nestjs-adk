---
"@nestjs-adk/core": major
"@nestjs-adk/mcp": major
---

A user-supplied MCP URL can no longer reach your own network.

`AdkMcpServer` exists so end users connect their own servers, which means its URL is untrusted input. Until now, `http://169.254.169.254/latest/meta-data/` pasted into a form connected from inside your network, with your egress (SSRF). Now every address is checked before the connection.

## Breaking

- `AdkMcpServer` (per-run sources) refuses, by default: private, loopback and link-local addresses (the hostname is resolved and every answer is checked, so `localhost`, `127.0.0.1` and a DNS name pointing at either are the same case); and public servers over plain http, because the user's credential would travel in the clear. Refusal is logged as an error and surfaces as `ToolSourceUnavailableError` carrying a `McpBlockedTargetError` cause: the run survives, the operator sees why.
- `McpOAuth.discover`, `register` and `exchange` run their requests through the same guard. Not only the first hop: the endpoints later calls POST to came from the server's own metadata, which is the same SSRF with one extra step.
- `McpDiscoveryError` now extends `AdkError` with `code: "MCP_DISCOVERY_FAILED"`. Catch blocks that matched on `error.name` keep working; ones that assumed a plain `Error` subclass without `code` may need adjusting.
- `McpModule.forRoot` is deliberately not guarded: that URL is the developer's own code, and a dev environment pointing at `http://localhost:3001` must keep working.

## Opting in to a private target

When the MCP server really belongs to the operator's network (a local dev server, an internal corporate MCP), say so explicitly:

```ts
new AdkMcpServer({ name, transport, allowPrivateNetwork: true });
await McpOAuth.discover(url, { allowPrivateNetwork: true });
```

The flag widens the network, not the protocol: http becomes acceptable for private targets, and a public server still must speak https, with no option to disable that.

## Redirects are checked hop by hop

Native fetch follows redirects on its own, and a public URL answering 302 to an internal address is the classic way around a check that only looks at the first URL. The guard rides into the MCP SDK transports as their `fetch`, follows redirects manually and re-validates every hop, giving up after five. Known limit: the connection still dials the hostname, so DNS rebinding (a name that answers differently on the second query) is not covered yet; pinning the resolved address in the dialer is the planned follow-up.

## New error and new field

- `McpBlockedTargetError` (`code: "MCP_BLOCKED_TARGET"`) joins the core taxonomy: a refusal, not an availability problem.
- `McpDiscovery.codeChallengeMethodsSupported` exposes what the server announces. Observability only: PKCE with S256 is always sent, as the spec requires; the field lets an application learn from telemetry which servers do not announce it.
- `assertSafeTarget(url, trust)` and `guardedFetch(trust)` are exported for applications that fetch user-supplied URLs around the same flow (a probe, an icon, a health check).
