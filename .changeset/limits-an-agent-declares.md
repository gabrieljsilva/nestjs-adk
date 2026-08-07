---
"@nestjs-adk/core": minor
---

`@Agent` accepts `limits`, and the README stops promising something the decorator could not declare.

`AgentDefinition.limits` existed and `RunScopeFactory` read it, but nothing ever filled it: the discovery step passed `undefined` into that slot of `AgentExecutionPolicies`, and `AgentOptions` had no field for it. An agent that needed more round trips than the rest of an application had no way to say so, and the application had to raise the module limit for every agent it had.

```ts
@Agent({
	name: "sales",
	description: "Catalog, prices and quotes.",
	limits: RunLimits.of(16),
})
export class SalesAgent extends AdkAgent {}
```

Declared and wrong is refused at boot, like every other field of the decorator: something that is not a `RunLimits` fails naming the provider, instead of leaving the agent silently on the module's limits while the developer believes it has its own.

Two documents said the levels narrow each other and that nothing widens what a level above decided. The code has always replaced, field by field, which is the behaviour kept here: an agent that declares sixteen iterations gets them even when the module said eight. A sector that genuinely runs longer is the reason the field exists, and capping it would leave the ceiling being raised for everyone instead. The README paragraph and the `RunScopeFactory` documentation now say that.
