# @nestjs-adk/mcp

**MCP servers as tools for [nestjs-adk](https://www.npmjs.com/package/@nestjs-adk/core).**

`AdkMcpServer` implements the core's `ToolSource`, so an MCP server's catalog becomes tools an agent can call. Nothing else in your code changes: those tools go through argument validation, offload, approval and events exactly like the ones you wrote.

```bash
npm i @nestjs-adk/core @nestjs-adk/mcp
```

## A server the application owns

Declare it in the module and it opens on every run:

```ts
import { AdkModule, AdkModuleOptions, RuntimeOptions } from "@nestjs-adk/core";
import { AdkMcpServer, EnvAuth } from "@nestjs-adk/mcp";

const docs = new AdkMcpServer({
	name: "docs",
	transport: { type: "stdio", command: "npx", args: ["-y", "@acme/docs-mcp"] },
	auth: new EnvAuth({ ACME_TOKEN: process.env.ACME_TOKEN ?? "" }),
});

AdkModule.forRoot(
	AdkModuleOptions.from({ defaultModel, runtime: RuntimeOptions.from({ sources: [docs] }) }),
);
```

## A server the user owns

This is the case MCP is usually for: each person connected their own integrations, so the set only exists at run time. Build the source per run and pass it on the call:

```ts
const result = await this.assistant.ask(message, {
	sessionId,
	sources: await this.integrationsOf(user.id),
});
```

The source opens when the run starts and closes when it ends, however it ends, so one user's connection never outlives their question. When a held tool call is approved later, the source is declared again on the decision, because the run that suspended closed its own:

```ts
await this.assistant.approve(sessionId, callId, { by: user.id, sources: await this.integrationsOf(user.id) });
```

## Naming and identity

`name` is the connection's identity inside a run. Every tool is offered to the model as `mcp__<name>__<tool>`, which is what tells it apart when the same server is connected twice under two accounts. Two sources in one run may not share a name.

`id` is the connection key. Supply the one you already have; without it the key is derived from the transport plus a hash of the credential, and never from the URL alone, or two users of the same server would look like one connection.

`tools` narrows the catalog to a subset. Omitted, the agent is offered everything the server exposes.

## Transports

```ts
{ type: "stdio", command: "npx", args: ["-y", "@acme/docs-mcp"], env: { ACME_TOKEN: token } }
{ type: "http", url: "https://mcp.acme.com", headers: { "X-Tenant": tenant } }
{ type: "sse", url: "https://mcp.acme.com/sse" }
```

`stdio` spawns a local process and speaks over its pipes. `http` and `sse` reach a remote one, and both carry headers, which is where a resolved credential lands.

## Authentication

How a server proves who is calling is a contract rather than a flag, because renewal is a property of the method: a static token has nothing to renew and OAuth does.

```ts
new BearerAuth(token); // Authorization: Bearer <token>
new HeaderAuth({ "X-Api-Key": key }); // any header the server expects
new EnvAuth({ ACME_TOKEN: token }); // environment variables, for a stdio server
new OAuthAuth({ tokens, client, onRefresh: (next) => this.tokens.save(user.id, next) });
```

`OAuthAuth` is the one with a trap worth naming. Pass `onRefresh` or a renewed token is used for the current run and then thrown away: the next run reads the old one out of your database, and a server that rotates refresh tokens refuses it for good. `client` comes from the registration and is what makes a refresh possible at all; without it an expired token is terminal. `skewMs` renews that many milliseconds before expiry so a long conversation does not expire halfway through.

For a method this package does not ship, extend `AdkMcpAuth`:

```ts
export class SignedAuth extends AdkMcpAuth {
	public async resolve(): Promise<McpCredential> {
		return { headers: { Authorization: await this.signer.sign() } };
	}

	public fingerprint(): string {
		return credentialDigest("signed", this.keyId);
	}
}
```

`fingerprint` is abstract on purpose rather than derived from the object's fields. Deriving it by serialization looks like it works, because TypeScript's `private` leaves properties enumerable, and then silently answers the same value for every instance of a class that uses real private fields. Two users would collapse into one connection, and one would run tools with the other's credential. `credentialDigest` hashes the parts you name, so a leaked log line reveals nothing.

## Getting a user authorized

`McpOAuth` covers the flow before you ever construct an `OAuthAuth`. It is four functions and no state, because the routes, the session and where tokens are stored are your application's, while only the parts the specification fixes belong here:

```ts
const discovery = await McpOAuth.discover(url); // where this server wants users authorized
const client = await McpOAuth.register(discovery, { redirectUri, clientName: "nebula" });
const { url: consent, verifier, state } = McpOAuth.authorize(discovery, client, { redirectUri });
// send the user to `consent`, then on the callback:
const tokens = await McpOAuth.exchange(client, { code, verifier, redirectUri });
```

PKCE with S256 is always sent, so `verifier` has to survive until the callback: it is what proves the code came back to whoever asked for it, which means server side, next to `state`, and never in the redirect. Keep `client` too, or a refresh has to rediscover everything.

Every hop is guarded, not only the first: the endpoints the later calls POST to came out of the server's own metadata, and a server naming `https://10.0.0.5/token` as its token endpoint is the same SSRF with one extra step. Discovery that fails throws `McpDiscoveryError`, which is a configuration answer and not something to retry: there is nowhere to send the user.

When a credential goes stale mid-run, throw `McpReauthRequiredError` from `resolve`. It reaches the runtime as the core's `ToolSourceAuthError`, and the run records a reauth event naming the source rather than failing: the conversation continues with fewer tools, and your application has what it needs to draw a reconnect button. A server that is simply unreachable is the other case and is reported as unavailable, because reconnecting fixes one and not the other.

## Two things that are untrusted input

Both defaults here are the cautious answer, because the URL and the annotations usually came from an end user rather than from you.

**`trustAnnotations`** decides whether a tool's `effect` is read from the server's own `readOnlyHint` and `destructiveHint`. Those are written by the server, so a server that marks a delete as read-only would turn your approval policy off by itself. Set it to `false` and every tool from that server counts as `destructive`, which means your policy pauses on all of them.

**`allowPrivateNetwork`** decides whether the URL may point at a private, loopback or link-local address, or speak plain http. It defaults to `false`, and that is an SSRF guard: without it a user-supplied URL reaches the cloud metadata endpoint or an internal Redis through your network. `assertSafeTarget` resolves the hostname and checks every address it answers with, because `169.254.169.254`, `localhost` and a DNS name pointing at either are the same attack written three ways. A refused target throws `McpBlockedTargetError`.

The guard does not care where the source was declared, so a server in the module is checked like any other. An internal MCP or one on `localhost` needs the flag even though you wrote its URL yourself:

```ts
new AdkMcpServer({ name: "internal", transport: { type: "http", url: "http://mcp.svc.cluster.local" }, allowPrivateNetwork: true });
```

A public target must speak https either way, and that one has no flag: a user's credential in cleartext to a third party has no legitimate case.

One limit stated plainly rather than glossed over: the connection that follows still dials the hostname, so a DNS name that answers differently on the second query (rebinding) is not covered. Closing that needs the resolved address pinned in the dialer.

`guardedFetch` is the same guard around an ordinary fetch, including across redirects, for the calls the OAuth flow makes.

## API reference

| Symbol | What it is for |
| --- | --- |
| `AdkMcpServer`, `AdkMcpServerOptions` | One MCP connection as a `ToolSource` |
| `McpTransportConfig` | `stdio`, `http` or `sse`, and what each one needs |
| `AdkMcpAuth`, `McpCredential` | The contract for proving who is calling, and what it resolves to |
| `BearerAuth`, `HeaderAuth`, `EnvAuth`, `OAuthAuth`, `OAuthAuthOptions` | The four methods this package ships |
| `credentialDigest` | A stable, non-reversible fingerprint for a credential |
| `McpOAuth`, `McpDiscovery`, `McpOAuthFetchOptions`, `McpTokens`, `McpClientInfo` | Discovery, registration and the token exchange |
| `assertSafeTarget`, `guardedFetch`, `TargetTrust` | The SSRF guard, and how much a target is trusted |
| `McpReauthRequiredError` | Thrown from `resolve` when only the user can fix it |
| `McpDiscoveryError`, `McpBlockedTargetError` | This package's own errors, both `AdkError` |

## Learn more

The full project lives at [github.com/gabrieljsilva/nestjs-adk](https://github.com/gabrieljsilva/nestjs-adk).
