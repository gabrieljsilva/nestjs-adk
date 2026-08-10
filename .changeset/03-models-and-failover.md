---
"@nestjs-adk/core": major
"@nestjs-adk/google": major
"@nestjs-adk/openai": major
---

Failover is declared where the agent is, `ModelRouter` is gone, and a request the provider refused stops the chain.

## Breaking: `ModelRouter` is gone

It never routed anything. It was an ordered "try the next one on failure" pretending to be a bigger concept, and it delegated each request still naming the router as its model. Gemini reads the request's model before its own, so the router's display name reached the API as a model id and every target failed with the same 400, making a broken name look like a provider outage.

Failover is now declared on the agent, and the list becomes a `SequentialFailoverPolicy`:

```ts
@Agent({
	name: "sales",
	description: "Sells.",
	model: primary,
	failover: [cheaper, elsewhere],
})
export class SalesAgent extends AdkAgent {}
```

A policy of your own extends `AgentFailoverPolicy` and receives the failure as data together with `FailoverContext`: the model that was serving, and the attempts already made, oldest first. It answers a `ModelReroute` or nothing, and nothing surfaces as `ModelsExhaustedError` carrying every failure.

The executor enforces two rules. Failover advances only on failures before the first chunk, because after a chunk part of the answer already reached the consumer, and an aborted request never fails over. The events a run journals carry real model ids rather than target nicknames, which is what logs and billing want.

## Breaking: `InvalidRequestFailure`

The failure taxonomy had no way to say "what you sent is wrong". A 400 about a field, a rejected key, a model that does not exist: all of them arrived as `UnknownFailure`, which reads like the provider had a bad day. Both adapters now classify a 4xx that is none of the recognised cases as `InvalidRequestFailure`, and `ModelFailure` answers `isInvalidRequest`.

`SequentialFailoverPolicy` stops on it. Every model in a chain is sent the same request, so a provider that called it malformed is describing something the next attempt carries unchanged: continuing spent a call per model to arrive at the first answer, with the cause buried under a list of models that were never the problem. A policy that wants the other bet, that a second provider accepts what the first refused, writes it, since the failure is handed over precisely so it can be decided on. Failover on a permanent failure is unaffected where it makes sense: a context window too small for the prompt is exactly what a bigger model is for.

## Typed options, and a provider the library knows nothing about

Generation parameters are typed rather than passed through a bag, so a typo fails the build instead of being silently dropped, and `createModelSpec<Map>` restricts options per model name when a model does not accept a given parameter. The capability map belongs to you, since the library does not ship one that would go stale.

`LlmModel` is the extension point for a provider neither adapter covers. It is an abstract class in the core with full dependency injection, named in `@Agent({ model })` like any other, over a neutral contract that covers streaming, multi-part content, tool calling, usage and structured output. `ModelDescriptor` is not decoration: the context window is what compaction measures against, and the capabilities are what the runtime checks before it accepts an attachment or offers tools.

## Structured output is checked before it is claimed

The OpenAI adapter asks for `strict: true` on every `outputSchema`, which is what makes the provider enforce the shape rather than suggest it. Strict mode only accepts a subset: every object closed with `additionalProperties: false`, every declared property listed in `required`. A schema outside it came back as a 400 naming a field, reaching the caller as a failed run instead of as the mistake it is.

The adapter now validates the schema first and throws `NonStrictJsonSchemaError`, naming the object and what it lacks (`the object at properties.customer leaves "name" out of "required"`). Nothing downstream catches this: the default validator in the core reads the answer as JSON without a schema language, so dropping `strict` quietly would trade a loud 400 for a shape nobody verifies. Gemini is unaffected, since `responseJsonSchema` accepts either shape.
