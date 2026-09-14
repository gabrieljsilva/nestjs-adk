---
"@nestjs-adk/mcp": minor
---

A tool left out of an MCP source cannot be declared and cannot run, and a source name can identify one installation of an integration.

`tools` was a filter over the catalog and nothing else: it decided what `open()` declared, and `callTool` never asked. The tool was hidden from the model and still perfectly callable, which is the wrong half to enforce. A tool result comes from a third party and enters the model's context, so a compromised server can talk the model into naming a tool the user switched off, and a model invents tool names on its own.

The question is now one object, `McpToolFilter`, asked when the catalog is built and again on every call. A refused call is answered to the model as a tool that is not available on that server and reaches no network, before the connection is even consulted. Whatever path reaches a tool next asks the same object rather than growing a second copy of the rule.

`excludeTools` joins it, because a product that lets people switch an integration's tools off stores the refusal, not the permission. Both lists carry the server's own tool names, never the published `mcp__<name>__<tool>` form: the prefix is presentation and may change, while what an application stored is what the server called the tool. When both name one tool, the denial wins.

```ts
new AdkMcpServer({ name, transport, excludeTools: ["delete_repo"] });
```

## A name that can be one installation

`name` is the connection's identity inside a run, and the same integration connected twice, two GitHub accounts of one person, needs two: a slug would publish two `mcp__github__create_issue` and leave the model unable to say which account it means. That was always the intent, and nothing enforced it, so the failure landed on the provider instead: a name with a space or a qualified name past 64 characters is a 400 that takes down every tool of the turn, not only the integration that caused it.

`name` is now validated where it is written. Letters, digits, `_` and `-`, at most 47 characters, or the constructor throws `McpInvalidSourceNameError` before any connection: the 47 is the 64 characters providers accept minus `mcp__`, the separators and room for a tool. It is rejected rather than normalized, since normalizing collapses two installations onto one prefix, which is the collision this exists to prevent.

A qualified name that still passes 64 is shortened deterministically instead of dropped: the first 55 characters, then `_` and eight hexadecimal digits of the full name's SHA-256. It is a pure function of the full name, so it is the same on every run, and the digest is what keeps two long tools of one server apart, which truncation alone would not.
