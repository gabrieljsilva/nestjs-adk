---
"@nestjs-adk/core": minor
"@nestjs-adk/mcp": minor
---

Who is calling, who may, and the same answer for an MCP client.

A tool that reads a person's data needs to know which person, and the run never did. `ask`, `approve` and `reject` now take an `actor`, an id and claims the runtime never reads, and every tool of the run receives it as `context.actor`, handovers and delegations included.

## An access policy, asked on every path

`AdkAccessPolicy.decide(tool, invocation, actor)` is asked before every invocation, after the arguments were parsed and before any approval is requested, so nobody approves a call the actor could not make. A refusal reaches the model as the tool's result, with the policy's reason. Declare it on `RuntimeOptions.access`; without one, `OpenAccessPolicy` grants everything, which is what an application that wrote none meant.

## What a class publishes

`@McpController({ tools })` declares what is served to MCP clients in the shape `@Agent({ tools })` declares what a model is offered: shared `@Tool` classes listed, `@Tool` methods on the class itself as client-only tools. A class an agent and a controller both list is one tool. A name two controllers publish fails the boot with `DuplicateExposedToolError`, naming both.

## The server

`McpServerModule.forRoot({ path, name, version, actors, imports, decorate })` in `@nestjs-adk/mcp` serves what the controllers published at one path, over stateless streamable HTTP. `actors` is the application's `McpActorResolver`, which turns a request into an actor or throws `McpUnauthorizedError` with the `WWW-Authenticate` challenge to write back. Every call walks the core's own `ToolGate`, so an outside client cannot do what the agent could not, because both go through one code path.
