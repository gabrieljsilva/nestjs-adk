---
"@nestjs-adk/core": minor
"@nestjs-adk/testing": patch
---

Every run answers what it cost, an embedder is injectable, and a tool source can belong to one run.

Declare one pricing source in the module and `AgentResult.cost` is filled on every run:

```ts
AdkModule.forRoot(
	AdkModuleOptions.from({
		defaultModel,
		runtime: RuntimeOptions.from({ pricing: new LiteLLMPricingSource() }),
	}),
);

const result = await support.ask("where is my order?");
result.cost.total.toString(); // "0.0000088"
result.cost.byModel[0]?.usage.totalTokens; // 52
result.cost.isComplete; // true
```

Money is an exact integer of pico dollars in a `bigint`, and that unit was measured rather than picked: of the 5345 rates LiteLLM publishes, a nano unit truncates 103 of them and reads the cheapest as zero. `toString()` is the exact decimal a `NUMERIC` column wants, `toNumber()` is documented as lossy, and `toJSON()` answers the string so a controller can return a result unchanged.

Each call is billed to the model that served it, so a reroute lands on its own line in `byModel`. A delegation's cost joins the parent's total once, with the child's model listed separately.

Nothing about a bill can fail a run. A model the source does not know, a source that throws, a provider that reported no tokens, a catalog that is down: each one leaves the model named in `cost.unpriced`, its tokens out of the total, `isComplete` false, and a `ModelUnpriced` at the notice sink. Declaring no source at all does the same, so a zero is never mistaken for free.

`LiteLLMPricingSource` reads the community catalog when the first run asks for a price and serves it from memory for a day. A read that fails keeps the table already loaded and is not retried until the retry window passes. Write your own `PricingSource` for negotiated rates or a persisted catalog: returning `undefined` is a normal answer.

`Embedder` is now resolved by the container:

```ts
AdkModule.forRoot(AdkModuleOptions.from({ defaultModel, embedder: new GeminiEmbedder() }));

@Injectable()
export class SearchService {
	public constructor(private readonly embedder: Embedder) {}
}
```

An application that declares none still boots and still injects: only code that embeds fails, and it names the option to declare. `PricedEmbedder` prices an embedding through the same source, and an embedder that reports no usage lands in `unpriced` rather than having its tokens guessed from characters.

Tool sources can now be declared per run, alongside the module's:

```ts
await assistant.ask(message, { sessionId, sources: await integrationsOf(user.id) });
await assistant.approve(sessionId, callId, { by: "gabriel", sources: await integrationsOf(user.id) });
```

They open with the run and close with it however it ends, so one user's connection never outlives their question. An approval declares them again because the run that suspended closed its own.

`@nestjs-adk/testing` passes the cost through: `RecordedRun` rebuilds the result rather than wrapping it, and was dropping the new field, so every run in a test read a cost of zero.

Breaking: `AgentResult` takes a sixth constructor argument, `ModelCost.of` and `ModelCost.including` take the usage, `AgentHandle.approve` and `AgentHandle.reject` take an options object where they took a name (a plain name still works), and `SystemClock` moved to `common/time` (the import from `@nestjs-adk/core` is unchanged).
