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

That is why `name` should be the installation's identity and not the integration's slug. Two GitHub accounts connected by the same person are two sources, and a slug would give both the same prefix: the model would be shown two `mcp__github__create_issue` and have no way to say which account it means.

```ts
new AdkMcpServer({ id: installation.id, name: `github-${installation.id}`, transport, auth });
```

Letters, digits, `_` and `-`, at most 47 characters. Anything else throws `McpInvalidSourceNameError` from the constructor, before a connection is attempted: the name is data you already hold, and a provider refusing the declaration takes down every tool of the turn rather than only this integration's. The 47 comes from the 64 characters providers accept for a function name, minus `mcp__`, the separators and room for the tool.

When the three segments together still pass 64, the qualified name is shortened deterministically: the first 55 characters, then `_` and eight hexadecimal digits of the full name's SHA-256. It is a pure function of the full name, so it is the same on every run, and the digest is what keeps two long tools of one server from answering to the same name.

`id` is the connection key. Supply the one you already have; without it the key is derived from the transport plus a hash of the credential, and never from the URL alone, or two users of the same server would look like one connection.

## Choosing which tools

`tools` narrows the catalog to a subset, `excludeTools` keeps tools out of it. Omit both and the agent is offered everything the server exposes.

```ts
new AdkMcpServer({ name, transport, tools: ["create_issue"] });
new AdkMcpServer({ name, transport, excludeTools: ["delete_repo"] });
```

Both lists carry the server's own tool names, `create_issue`, never the published `mcp__<name>__<tool>` form: the prefix is presentation and may change, while what your database stored is what the server called the tool. When both name the same tool, `excludeTools` wins: the two express opposite intents, and only "off is final" fails safe.

A tool that is left out is not declared **and** not callable. The list is one object, asked once when the catalog is built and again on every call, so a tool the user switched off cannot be reached by a model that invented the name or by a server that talked the model into naming it. The call is refused before the connection is consulted and reaches no network; the model is answered that the tool is not available on that server.

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

`OAuthAuth` is the one with a trap worth naming. Pass `onRefresh` or a renewed token is used for the current run and then thrown away: the next run reads the old one out of your database, and a server that rotates refresh tokens refuses it for good. `client` comes from the registration and is what makes a refresh possible at all; without it an expired token is terminal. `skewMs` renews that many milliseconds before expiry so a long conversation does not expire halfway through, `resource` names the RFC 8707 audience to renew for, and `allowPrivateNetwork` and `fetch` say how the renewal reaches the network, on the same terms the source itself uses.

A renewal that fails does not always mean the credential is finished, and the difference is the fact to act on. `McpReauthRequiredError` means only the user can fix it: the refresh token was revoked, rotated away or never existed. `McpTokenGrantError` with a `rejection` of `"transient"` means the provider was rate limited or briefly broken, revoked nothing, and will very likely answer the next run: it reaches the runtime as unavailable rather than as reauth, so nobody is sent through consent over a 429 and no application discards a refresh token that still works.

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

`McpOAuth` covers the flow before you ever construct an `OAuthAuth`. It is stateless, because the routes, the session and where tokens are stored are your application's, while only the parts the specification fixes belong here:

```ts
const discovery = await McpOAuth.discover(url); // where this server wants users authorized
const client = await McpOAuth.register(discovery, { redirectUri, clientName: "nebula" });
const { url: consent, verifier, state } = McpOAuth.authorize(discovery, client, { redirectUri });
// send the user to `consent`, then on the callback:
const tokens = await McpOAuth.exchange(client, { code, verifier, redirectUri });
// and on uninstall, what the provider is willing to take back:
await McpOAuth.revoke(discovery, client, { token: tokens.refreshToken, tokenType: "refresh_token" });
```

Store the whole `client`, not just the id and the secret. `authMethod` is how the token endpoint has to be called, which is not always the method that was asked for; `secretExpiresAt` is when the registration lapses, and without it the first sign is every renewal failing at once, months later; `registrationAccessToken` and `registrationClientUri` are RFC 7592 and the only way to `unregister` the client afterwards. `tokens.scope` is what the provider actually granted, which may be narrower than what was requested.

`McpOAuthClient` is the same flow with the knobs. Instantiate it when the defaults do not fit:

```ts
new McpOAuthClient({
	allowPrivateNetwork: true, // an MCP server on your own network, cleartext included
	clientMetadata: { logo_uri, policy_uri }, // extra RFC 7591 fields a provider asks for
	authMethods: ["client_secret_basic"], // preference order, intersected with what the server accepts
	fetch: throughTheProxy, // replaces the guarded fetch, and then owns the guard
});
```

Client authentication is negotiated rather than assumed: the server's `token_endpoint_auth_methods_supported` decides, and `client_secret_post` stays the first preference because it is what every provider met here accepts. The same goes for `grant_types`, since asking for `refresh_token` where it is not offered is how a whole registration gets refused.

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

## Serving your tools to MCP clients

The other direction: what your `@McpController` classes publish, served at one path.

```ts
McpServerModule.forRoot({
	path: "/mcp",
	name: "acme",
	version: "1.0.0",
	actors: KeycloakActors,
	imports: [AuthModule],
	decorate: [Public()],
});
```

`actors` is your provider, exported by one of the modules in `imports`: it turns a request into an `Actor` or throws `McpUnauthorizedError`, whose `challenge` is what the endpoint returns as `WWW-Authenticate`. For a server behind OAuth that is the line an MCP client follows to find out where to send a person, `Bearer resource_metadata="https://api.acme.com/.well-known/oauth-protected-resource/mcp"`, and the document at that address is yours to serve. The module never sees a credential.

```ts
@Injectable()
export class KeycloakActors extends McpActorResolver {
	public async resolve(request: McpRequest): Promise<Actor> {
		const token = request.bearerToken;
		if (token === undefined) throw new McpUnauthorizedError("no bearer token", CHALLENGE);
		const verified = await this.keycloak.verifyForAudience(token, "acme-mcp");
		return Actor.of(verified.sub, { scopes: verified.scopes });
	}
}
```

Every call then goes through the core's own gate: the tool's schema parses the arguments, the access policy declared on `AdkModule` judges the actor, and only then does the handler run. An outside client cannot do what the agent could not, because both walk the same code. Arguments the schema refuses and actors the policy refuses come back as an error result the client shows, never as a protocol failure.

`decorate` applies class decorators to the endpoint's controller, for whatever your application does to every route: marking it public to a global guard, throttling it, choosing a filter. The transport is stateless streamable HTTP, a server per request, so instances behind a balancer answer alike. A tool's `effect` is published as the client's `readOnlyHint` and `destructiveHint`.

## API reference

| Symbol | What it is for |
| --- | --- |
| `AdkMcpServer`, `AdkMcpServerOptions` | One MCP connection as a `ToolSource` |
| `McpTransportConfig` | `stdio`, `http` or `sse`, and what each one needs |
| `AdkMcpAuth`, `McpCredential` | The contract for proving who is calling, and what it resolves to |
| `BearerAuth`, `HeaderAuth`, `EnvAuth`, `OAuthAuth`, `OAuthAuthOptions` | The four methods this package ships |
| `McpClientAuthMethod` | How the client authenticates at the token endpoint |
| `credentialDigest` | A stable, non-reversible fingerprint for a credential |
| `McpOAuth`, `McpDiscovery`, `McpOAuthFetchOptions`, `McpTokens`, `McpClientInfo` | Discovery, registration and the token exchange |
| `McpOAuthClient`, `McpOAuthClientOptions` | The same flow with private networks, client metadata and a substituted fetch |
| `McpTokenEndpoint`, `McpTokenEndpointOptions` | One client's calls to its token endpoint: exchange, renewal, revocation |
| `McpMetadataReader`, `McpMetadataLookup` | Where the well-known documents live, and what one lookup answered |
| `assertSafeTarget`, `guardedFetch`, `TargetTrust` | The SSRF guard, and how much a target is trusted |
| `McpReauthRequiredError` | Thrown from `resolve` when only the user can fix it |
| `McpTokenGrantError`, `McpGrantRejection` | A token endpoint refused, and whether that is worth retrying |
| `McpDiscoveryError`, `McpBlockedTargetError` | This package's own errors, both `AdkError` |
| `McpServerModule`, `McpServerOptions` | What your controllers publish, served at one path |
| `McpController` | Re-exported from the core: declares what a class publishes |
| `McpActorResolver`, `McpRequest` | Who is calling, decided by the application from the request |
| `McpUnauthorizedError` | A refusal, with the challenge the endpoint writes back |
| `McpToolAnnotations` | A tool's effect as a client reads it |

## Learn more

The full project lives at [github.com/gabrieljsilva/nestjs-adk](https://github.com/gabrieljsilva/nestjs-adk).
