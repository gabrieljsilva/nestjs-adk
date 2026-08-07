---
title: Replacing a tool in a test
description: How a substituted tool keeps its declaration, what a double has to preserve, and when a listed tool fails the boot
type: pattern
tags: [testing, nestjs, tools, discovery]
---

`overrideProvider(SomeTool)` replaces a tool. All three forms work, and each keeps the declaration the agent listed:

```ts
builder.overrideProvider(FindOrderTool).useValue({ execute: () => ({ status: "shipped" }) });
builder.overrideProvider(FindOrderTool).useClass(FindOrderDouble);
builder.overrideProvider(FindOrderTool).useFactory({ factory: () => new FindOrderDouble() });
```

That works because the scan reads a component's declaration from the **injection token**, not from the class NestJS ended up building. The token is the one part of a provider an override never rewrites: `useValue` leaves no metatype at all, `useClass` leaves the replacement class, `useFactory` leaves an anonymous function. It is also what `@Agent({ tools: [FindOrderTool] })` actually names, so the two ends match by construction.

`NestProviderScan.carrierOf` tries the token first and the metatype second. The fallback is what keeps a component registered under a token of its own working: `{ provide: SHIP_ORDER, useClass: ShipOrderTool }` puts a symbol where the decorators are not, so the metatype answers. The agent still lists the class in that case, because the class is what carries the declaration:

```ts
@Module({ providers: [{ provide: SHIP_ORDER, useClass: ShipOrderTool }] })
@Agent({ name: "logistics", description: "Ships.", tools: [ShipOrderTool] }) // the class, not SHIP_ORDER
```

## What a double has to keep

**The token.** Registering the double under a new token is not an override, it is a second provider. The original is still there, still the one the agent listed, and the double is never reached.

**An `execute` method.** A value that forgets it now fails at boot naming the provider and the method, rather than composing a tool that answers nothing.

**Every method the real class decorated.** An agent's own `@Tool` and `@Skill` methods are read from the token class and bound on the instance the container serves, so a double standing in for an agent has to answer to those names too.

Copying `TOOL_METADATA` onto a replacement class does not make it the tool: the metadata says what a class declares, and the token says which declaration the agent asked for. Override the token and the metadata takes care of itself. What the decorator wrote is readable through `ToolMetadata`: see [[tool-declaration]].

## A listed tool that nobody registered

`@Agent({ tools: [FindOrderTool] })` naming a class absent from `providers` is `UnregisteredToolError` at boot, listing the tools that were found. It used to be a shorter tool list and no complaint, which surfaced much later as a model that would not do its job.

## The ergonomic form

`AdkTestBedBuilder.replaceTool` in `@nestjs-adk/testing` substitutes the behaviour and records the arguments, which is usually what a test wanted from a double:

```ts
const refund = ToolFake.replacing(IssueRefundTool).succeedsWith({ refunded: true });
await AdkTestBedBuilder.for({ imports: [AppModule] }).replaceTool(IssueRefundTool, refund).boot();

expect(refund.lastArgs()).toEqual({ orderId: "A-1042" });
```

It swaps the method on the instance the container built, between `compile()` and `init()`, which keeps the real class and everything on it. The timing is the one in [[nest-composition-timing]]: `compile()` has built every instance and the runtime only reads them in `onModuleInit`. The bed it belongs to is [[test-bed]].

## Before reaching for a double at all

A double changes behaviour. To find out what a tool **received**, no double is needed: the run's events carry the arguments and the output, and asserting on them is what [[testing-conventions]] asks for.

```ts
expect(run.callsTo("issue_refund").at(0)?.args).toEqual({ orderId: "A-1042" });
```
