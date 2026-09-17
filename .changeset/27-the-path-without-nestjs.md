---
"@nestjs-adk/core": major
---

The path without NestJS: one call to a running runtime, one defaults table behind both entry points, and a module that takes a plain object.

## `createAdkRuntime`

The runtime never asked a container for anything, and now it is reachable without one. Agents in, a started runtime out:

```ts
const adk = await createAdkRuntime({ agents: [support] });
const answer = await adk.findAgent("support").ask("where is order 42?");
await adk.stop();
```

What comes back is a `StartedAdkRuntime`, and it answers `AgentHandle`s rather than repeating their verbs: `findAgent` gives the same handle a NestJS application injects, so `ask`, `stream`, `approve`, `reject` and `delegate` are the same thirteen methods in both worlds instead of two copies that drift. `agents` lists one per declared agent, `runtime` is everything a handle does not cover, `composed` is what the runtime was built against, and `stop` drains the runs still going.

`storage`, `artifacts`, `clock`, `ids`, `runtime` and `exposed` are the same names `AdkModule` takes, and `runtime` is the `RuntimeOptions` patch rather than built options.

## One defaults table

`RuntimeDefaults` is where the in-memory session storage, the in-memory artifact storage, the system clock and the random id generator are decided, and both entry points read it. `adk.module.ts` no longer holds a copy, so the same application cannot store conversations in one place under NestJS and in another without it.

`AdkRuntime.start` takes an input object instead of seven positional parameters, and accepts an `AgentDefinition` directly where it used to demand a `DeclaredAgent`.

## A module declared with an object

`AdkModule.forRoot({ defaultModel })` is the form to write, and `AdkModuleOptions.from` is applied internally. An `AdkModuleOptions` instance is still accepted, and so is either form from a `forRootAsync` factory. `AdkModuleOptions.runtime` takes the `RuntimeOptionsPatch` literal as well as built `RuntimeOptions`, so a module declaration reads as data:

```ts
AdkModule.forRoot({
	defaultModel: flash,
	storage: new SqliteSessionStorage(connection),
	runtime: { tools: { approvals: EffectApprovalPolicy.never() } },
});
```

## Exported

`createAdkRuntime`, `AdkRuntimeInput`, `StartedAdkRuntime`, `RuntimeDefaults`, `AdkRuntimeStartInput`, `RuntimeComponents`, `DeclaredAgent`, `AgentDefinitionInput`, `AgentExecutionPolicies`, `AgentTransferPolicy`, `AgentDelegationPolicy`, `SkillDefinition`, `AskInput`, `AskInputParams`, `ApproveInput`, `RejectInput` and `DelegateInput`.

`AgentHandle`, `AgentNotBoundError` and `RandomIdGenerator` moved out of `public/nest`, since none of them knows the framework. The names and the entry point are unchanged.
