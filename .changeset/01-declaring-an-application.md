---
"@nestjs-adk/core": major
---

Declaring an application: options built in the container, edges as classes, prompts per run, and discovery that survives a substituted provider.

## Options that come from the container

`forRoot` takes a value, which is enough while every option is one. Most of what an application eventually plugs in is not: a storage holding a database client, an embedder that needs credentials, a pricing source with an HTTP client, an approval policy that reads the current tenant. None of those exist where the module is declared, and the only way out was a wrapper module that spread the library's `forRoot` and overrode `ADK_OPTIONS`, resting on a token that was never promised to keep meaning what it means.

```ts
AdkModule.forRootAsync({ imports: [InfraModule], useClass: AdkOptions });
```

`useClass` is the form to reach for, and the reason is types. A factory declares its dependencies in an `inject` array TypeScript cannot line up with the parameters that receive it, so two entries swapped compile and fail at boot; a class declares them in a constructor NestJS resolves and TypeScript checks like any other provider's. `AdkOptionsFactory` is the interface it implements, `useExisting` points at an instance another module already provides, and `useFactory` with `inject` is there for the cases that want it.

Declaring none of the three is refused, and so is declaring two, both where `forRootAsync` is called rather than during the boot they would otherwise poison, carrying `ASYNC_OPTIONS_NOT_DECLARED` and `CONFLICTING_ASYNC_OPTIONS`. `forRoot` is untouched, and an application using it has nothing to do.

`RuntimeOptions` and `AdkModuleOptions` gain `from` and `with`, so three fields change without restating twelve.

## Edges declared as classes

```ts
@TransfersTo(SalesAgent, WarrantyAgent)
@DelegatesTo(BillingAgent)
export class ConciergeAgent extends AdkAgent {}
```

Renaming an agent now follows on its own, the editor finds the declaration, and a target that does not exist fails the build instead of the boot. `@TransfersTo("biling")` compiled fine and only spoke up when the application started.

Two agents that reach each other cannot name each other directly, because a decorator runs while its own class is being defined and the other end is still `undefined`. Pass a function there, the same shape an ORM uses for a relation that points back: `@TransfersTo(() => BillingAgent)`. Resolution happens during the scan, in `onModuleInit`, once every module has loaded.

Plain names still work and remain the only form for an agent whose class a module does not import; they are also what travels on the wire, since the model transfers by calling `transfer_to_agent` with a name. A class that never declared `@Agent` is `InvalidAgentMetadataError` at boot, and a function that throws while being read reports what it threw as `cause`. The target still has to be a registered provider, so `UnknownTransferTargetError` stays.

## A prompt built per run

`@Agent({ prompt })` still declares a fixed text. What is new is overriding `prompt()`, for an instruction that depends on data:

```ts
@Agent({ name: "support", description: "..." })
export class SupportAgent extends AdkAgent {
	public constructor(private readonly customers: FindCustomerUseCase) {
		super();
	}

	protected override async prompt(context: PromptContext): Promise<string> {
		const customer = this.customers.execute(context.owner?.value ?? "");
		return this.prompting.renderFromFileOrFail("support.md", { name: customer.name });
	}
}
```

The agent is an ordinary provider, so the repository that knows the customer is a constructor argument. That is the point of the shape: the data reaches the system prompt instead of being concatenated into the user's message, which is the one place a model has been told to treat text as somebody else's words.

`this.prompting` answers three things. `render(template, vars)` interpolates text the agent already has, so prompts kept in a database need no port at all; `renderFromFile(path, vars)` answers `undefined` when there is no such prompt, and `renderFromFileOrFail(path, vars)` throws naming the path the source resolved. `{{name}}` is optional and renders as nothing, `{{{name}}}` is required and a prompt missing one fails naming every missing key at once, with `null` counting as missing for both.

Prompts are files by default, read once and served from memory, from `./prompts` or from the directory named in `prompts: { dir }`. Implement `PromptSource` and pass `promptSource` to serve them from anywhere else; declaring both is refused, since `prompts.dir` configures the source the other one replaces. Replacing the source changes nothing about the agents, because they pass a name and never a location. Three things are the source's own: caching, for which `PromptFileCache` is exported, failure, since whatever `load` throws ends the run, and construction, since `promptSource` takes an instance.

`PromptContext` carries the session id, the run id, the agent about to answer, the session's owner and the run's signal. The owner is the session's rather than the call's, so a conversation continued tomorrow builds for the same person it was opened for.

A prompt built per run is a prompt the provider cannot cache: the system prompt is the head of the prefix, and this repository measured 3031 of 3751 prompt tokens coming back cached, worth 68% of that run's input bill. Keep the variable part small and stable within a session: a customer name is fine, a timestamp is not. It resolves once per agent per run, before the first turn, and a transfer or a delegation resolves the prompt of whoever took over. Declaring `@Agent({ prompt })` and overriding `prompt()` on the same agent fails at boot, because any precedence rule would leave one declaration reading like a configured prompt the model never received.

## Breaking: discovery reads the injection token, and a listed tool nobody registered fails the boot

The scan took both a component's identity and its declaration from the provider's `metatype`, which NestJS rewrites the moment a provider is overridden: `useValue` leaves no metatype at all, `useClass` leaves the replacement class, `useFactory` an anonymous function. Meanwhile `@Agent({ tools: [FindOrderTool] })` names an injection token, which NestJS never rewrites. The two ends stopped matching and the tool left the catalog without a word: the module booted, the agent answered, and the model was simply never offered the tool it exists to call. An overridden `@Agent` class vanished the same way, resurfacing later as `AgentNotBoundError` naming a class nobody wrote.

All three forms now work, for tools and for agents, reading the token first and falling back to the metatype, which keeps `{ provide: SHIP_ORDER, useClass: ShipOrderTool }` working.

`@Agent({ tools: [FindOrderTool] })` naming a class absent from `providers` used to produce a shorter tool list and no complaint. It is now `UnregisteredToolError`, naming the agent, the class and the tools that were found. Two consequences worth checking before upgrading: a decorated class registered through a value or a factory was invisible to the runtime and is now a live tool, and a double registered as a value without an `execute` method now fails at boot instead of vanishing. `ToolMetadata.copy` is gone, since it existed to make a replacement class declare a tool it was not.

`@Agent` also refuses a field it cannot use. Leaving one out still means the default; declaring one the runtime cannot use fails at boot with `InvalidAgentMetadataError` naming the provider and the field, instead of falling back in silence while the developer believes the agent is configured. It covers `model`, `prompt`, `compaction`, `tools`, `limits` and `failover`, and a failover list says which entry is wrong rather than cancelling the whole chain over one typo.
