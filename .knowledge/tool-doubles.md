---
title: Replacing a tool in a test
description: Why overrideProvider removes a tool instead of replacing it, and what to do instead
type: pitfall
tags: [testing, nestjs, tools, discovery]
---

`overrideProvider(SomeTool)` does not replace a tool. It removes it, and nothing says so.

Both forms fail, for different reasons, and both fail silently: the module boots, the agent answers, and the tool is simply never offered to the model. The test then fails somewhere else entirely, usually on an assertion about the answer.

## `useValue` erases the class

`NestProviderScan.read` keeps a provider only when `typeof provider.metatype === "function"`. Measured on NestJS 11: a provider registered with `useValue` has a `metatype` of `object`, so the scan skips it and the tool never becomes a `ToolDefinition`.

## `useClass` breaks the match

With `useClass` the metatype is a function again, so the scan keeps it. But `NestAgentScanner.sharedTools` keys tools **by class**, and `declaredTools` looks up exactly the classes the agent listed in `@Agent({ tools: [...] })`. The key is now the replacement class, the lookup misses, and the tool leaves that agent's catalog.

Copying `TOOL_METADATA` onto the replacement does not help: the metadata makes it a tool, and the identity is what the agent asked for.

## What works

Replace the method on the instance the container built, between `compile()` and `init()`:

```ts
const module = await builder.compile();
const tool = module.get(SomeTool);
Object.defineProperty(tool, "execute", { value: fake, configurable: true, writable: true });
await module.init();
```

The class, the metadata, the name, the schema, the effect and the identity all stay; only the behaviour changes. The timing is the one documented in [[nest-composition-timing]]: `compile()` has built every instance and the runtime only reads them in `onModuleInit`.

`AdkTestBedBuilder.replaceTool` in `@nestjs-adk/testing` does exactly this. Prefer it over reaching for the NestJS builder.

## Before reaching for a double at all

A double changes behaviour. To find out what a tool **received**, no double is needed: the run's events carry the arguments and the output.

```ts
expect(run.callsTo("issue_refund").at(0)?.args).toEqual({ orderId: "A-1042" });
```

Related: [[testing-conventions]], [[nest-composition-timing]], [[tool-declaration]].
