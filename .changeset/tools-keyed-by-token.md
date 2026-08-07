---
"@nestjs-adk/core": major
---

Discovery reads a component's declaration off the injection token, so a substituted tool stays in the catalog.

The scan took both a component's identity and its declaration from the provider's `metatype`, which NestJS rewrites the moment a provider is overridden: `useValue` leaves no metatype at all, `useClass` leaves the replacement class, `useFactory` an anonymous function. Meanwhile `@Agent({ tools: [FindOrderTool] })` names an injection token, which NestJS never rewrites. The two ends stopped matching and the tool left the catalog without a word: the module booted, the agent answered, and the model was simply never offered the tool it exists to call. An overridden `@Agent` class vanished the same way, resurfacing much later as `AgentNotBoundError` naming a class nobody wrote.

All three forms now work, for tools and for agents:

```ts
builder.overrideProvider(FindOrderTool).useValue({ execute: () => ({ status: "shipped" }) });
builder.overrideProvider(FindOrderTool).useClass(FindOrderDouble);
builder.overrideProvider(FindOrderTool).useFactory({ factory: () => new FindOrderDouble() });
```

`NestProviderScan` reads the token first and falls back to the metatype, which keeps a component registered under a token of its own working: `{ provide: SHIP_ORDER, useClass: ShipOrderTool }` puts a symbol where the decorators are not.

## Breaking: a listed tool nobody registered fails at boot

`@Agent({ tools: [FindOrderTool] })` naming a class absent from `providers` used to produce a shorter tool list and no complaint. It is now `UnregisteredToolError`, naming the agent, the class and the tools that were found.

Two consequences worth checking before upgrading. A decorated class registered through a value or a factory was invisible to the runtime and is now a live tool, so an application that wired one by accident will start offering it to the model. And a double registered as a value without an `execute` method now fails at boot instead of vanishing.

`ToolMetadata.copy` is gone. It existed to make a replacement class declare a tool it was not, which is no longer a thing anybody has to do.
