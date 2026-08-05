---
"@nestjs-adk/core": major
"@nestjs-adk/google": major
---

Failover is a property of the model, executed by the lib, and `ModelRouter` is gone.

`ModelRouter` never routed anything: it was an ordered "try the next one on failure" pretending to be a bigger concept, and it ran on the ADK's `@experimental` `RoutedLlm`, which delegated each request still naming the ROUTER as its model. Gemini reads `llmRequest.model` before its own, so the router's display name reached the API as a model id and every target failed with the same 400, making a broken name look like a provider outage.

## Breaking: declare failover on the model

The primary is the identity; the chain is an attribute of it. Every model can carry one: the `Gemini` and `OpenAiLike` specs, a custom `AdkModel`, and the `ScriptedModel` in tests.

```ts
// before
new ModelRouter({ targets: { primary: new Gemini("gemini-2.5-flash"), fallback: new OpenAiLike("gpt-4o-mini") } });

// after: array form, any pre-stream failure advances in order
new Gemini("gemini-2.5-flash", { failover: [new OpenAiLike("gpt-4o-mini")] });

// after: function form, the policy is yours
new Gemini("gemini-2.5-flash", {
	failover: (error, { currentModel, failures }) => {
		if (httpStatusOf(error) === 400) return undefined; // fails the same everywhere: give up
		if (failures.length === 0) return new Gemini("gemini-2.5-flash"); // one retry of the primary
		return new OpenAiLike("gpt-4o-mini"); // then degrade
	},
});
```

The function receives the raw error and `{ currentModel, failures }` (previous attempts, oldest first). It returns the next target: a spec, a model id, a custom `AdkModel` instance or its DI class, resolved lazily at the attempt; or `undefined` to give up, which surfaces as `ModelsExhaustedError` carrying every failure. Returning the same model is a retry; a hard ceiling stops a policy that never gives up. `failoverPolicy()` normalizes the array form and is exported for engines.

## Semantics the executor enforces

Failover advances only on failures BEFORE the first chunk; after a chunk, part of the answer already reached the consumer and the error propagates. An aborted request never fails over. The chain is flat: a target that declares failover of its own is refused at boot with `NestedFailoverError`. Class targets in the array form resolve through DI at boot, fail-fast; targets born inside the function resolve at the attempt. `model_rerouted` events now carry real model ids instead of target nicknames, which is what logs and billing want.

## The executor is the lib's

`@nestjs-adk/google` runs the chain with its own `FailoverLlm`; the dependency on the ADK's `RoutedLlm` is gone, and so is the `PinnedLlm` workaround, because each attempt receives the request naming that attempt's own model by construction. `httpStatusOf()` is exported for policies that branch on the provider's HTTP status: it reads the shapes the built-in specs' SDKs produce and answers `undefined` for what it does not know.
