---
title: Who is calling, and who may
description: How an actor reaches a tool, where the one access rule is asked, and why an MCP server walks the agent's own gate
type: pattern
tags: [core, mcp, tools, security, nestjs]
---

A tool that reads a person's data needs two things the model must never choose: who is asking, and whether they may. Both are decided outside the tool and arrive through the same door on every path.

## The actor travels with the call, not with the session

`Actor` is an id and a bag of claims the runtime never reads. The caller passes it on `ask`, `approve` and `reject`; it rides on `AgentRunCommand`, into `RunScope`, through `ToolExecutionCommand` and lands on `ToolContext.actor`. A handover and a delegation copy it from the parent scope, so a transferred conversation still runs for the same person.

It is deliberately not the session owner. The owner is who the conversation belongs to, written once and read back for a resumed approval; the actor is who is acting now, which in a shared chat or a decision taken by somebody else is a different person. Nothing about the actor is persisted, and a resumed approval names its own.

## One gate, two doors

`ToolGate.admit` is where a call becomes runnable: the tool's schema parses the arguments, then `AdkAccessPolicy.decide` is asked about this actor, this tool and these arguments. `ToolExecutor` calls it before the approval check, because nobody should be asked to approve a call the actor could not make, and a denial is answered to the model as a failed tool result that says `{ refused: true, reason }`, never `{ error }`: a model told of an error explains a fault and retries, a model told of a refusal says so and moves on. The key is a boolean so the vocabulary holds in whatever language the reason is written.

The MCP server in `@nestjs-adk/mcp` holds the same `ToolGate`, reached through `RuntimeServices.gate`, and admits a client's call with it before invoking the handler. That is the property the whole design exists for: an outside client cannot do what the agent could not, not because two modules agree, but because there is one code path. The runtime's own tools (`read_artifact`, `activate_skill`) bypass the policy on both paths, for the reason [[tool-approval]] gives.

`OpenAccessPolicy` is the default and grants everything, actor or not. An application that declares a policy decides what an absent actor means; the shipped guidance is to refuse it.

## What a source will not run, it does not declare either

An MCP source narrows its catalog with `tools` and `excludeTools`, and both are one object, `McpToolFilter`, asked where the catalog is built and again inside `callTool`. A list applied only to the declaration hides a tool from the model without stopping the call, which is the wrong half: a tool result comes from a third party and enters the model's context, so a compromised server can talk the model into naming a tool the user switched off, and a model invents tool names by itself. A refused call is answered as unavailable and reaches no network, before the connection is even consulted. Denial wins over permission when both lists name a tool, since only "off is final" fails safe. Both lists carry the server's raw names and never the published `mcp__<source>__<tool>`: the prefix is presentation and may change.

The source segment of that prefix is the connection's identity and not the server's, which is what lets one integration be installed twice under two accounts. It is validated where it is written, at construction, against what a provider accepts as a function name: rejected rather than normalized, because normalizing collapses two installations onto one prefix, and a qualified name past 64 characters is shortened with a digest of the full name rather than dropped, because a provider refusing the declaration takes down every tool of the turn and not only that integration's.

## What is published is declared like what is offered

`@McpController({ tools })` mirrors `@Agent({ tools })`: shared `@Tool` classes are listed, `@Tool` methods on the class are the controller's own. `NestControllerScanner` builds them with the same `NestToolFactory` and the same shared index the agent scanner uses, so a class listed by both is one `ToolDefinition`. An MCP server has one flat namespace, so a name two controllers publish is `DuplicateExposedToolError` at boot, naming both providers. The result is `RuntimeServices.exposed`, a `ToolCatalog` the server reads per request, which is what keeps [[nest-composition-timing]] intact: the server's providers are built before the runtime exists.

The controller is a provider, not an HTTP controller. The route belongs to `McpServerModule.forRoot`, which mounts a subclass of one endpoint at the chosen path; the application supplies the `McpActorResolver` that turns a request into an actor, and receives the endpoint's controller class through `decorate` for whatever it does to every route. The resolver is reached through `useExisting` rather than built by the module, because a resolver that checks a token needs the application's own services and only the module that declares it knows where they come from.

## What the server does not decide

Nothing in the lib checks a credential, publishes OAuth metadata, or filters `tools/list` by actor. A client sees every published tool and is refused on call; hiding the name would be a second rule to keep in step with the first. A tool called by a client has no run, so `McpCall` names the session, run and call after the MCP request id under an `mcp:` prefix, which a tool that logs them can tell apart and nothing on the agent's side can collide with.

Related: [[tool-declaration]], [[tool-approval]], [[module-boundaries]].
