---
"@nestjs-adk/mcp": patch
---

MCP OAuth: find the well-known documents where they actually live, and read the token response in either dialect.

Discovery only ever asked the root of the host. RFC 9728 and RFC 8414 §3.1 insert the path AFTER the well-known segment, so a server mounted on a path publishes at `/.well-known/oauth-protected-resource/mcp` and legitimately answers 404 at the root. GitHub's MCP server does exactly that, and the flow reported it as a server publishing no authorization metadata at all. Both documents are now looked up path-inserted first, then at the root, and an OpenID Connect provider is accepted through `/.well-known/openid-configuration`. Asking the path-inserted location first also matters on a shared host, where the root document describes another tenant. OpenID Connect is the one dialect that appends the path instead of inserting it, so `{issuer}/.well-known/openid-configuration` is probed too, which is where a provider like a Keycloak realm actually publishes.

The issuer check now compares the whole issuer, path included, not just the origin. On a shared host the tenants differ only by path, and an origin comparison would accept a document describing another tenant, which is the confused-deputy setup the check exists to stop. A trailing slash does not fail it.

Token exchange assumed JSON. GitHub answers `application/x-www-form-urlencoded` unless asked otherwise, and `JSON.parse` on `access_token=...` threw a syntax error that read like a broken provider instead of a working one in another dialect. The request now sends `accept: application/json`, the response is decoded by its content type with the other dialect as fallback, and an OAuth error riding on a 200 is reported as that error instead of "token response carried no access token".

Registration failures carry the provider's own `error_description` alongside the status. "Registration failed with 400" sent the operator to read the client's code, when the body already said the integration was not allowlisted.
