---
"@nestjs-adk/core": major
"@nestjs-adk/google": major
"@nestjs-adk/openai": major
---

A request the provider refused is told apart from a provider that failed, and stops the failover chain.

## `InvalidRequestFailure`

The failure taxonomy had no way to say "what you sent is wrong". A 400 about a field, a rejected key, a model that does not exist: all of them arrived as `UnknownFailure`, which reads like the provider had a bad day. Both adapters now classify a 4xx that is none of the recognised cases as `InvalidRequestFailure`, and `ModelFailure` answers `isInvalidRequest`.

`SequentialFailoverPolicy`, which is what the list form of `failover` becomes, stops on it. Every model in a chain is sent the same request, so a provider that called it malformed is describing something the next attempt carries unchanged: continuing spent a call per model to arrive at the first answer, with the cause buried under a list of models that were never the problem. A policy that wants the other bet, that a second provider accepts what the first refused, writes it: `next` is handed the failure precisely so it can be decided on.

Failover on a permanent failure is unaffected where it makes sense. A context window too small for the prompt is exactly what a bigger model is for.

## Structured output is checked before it is claimed

The OpenAI adapter asks for `strict: true` on every `outputSchema`, which is what makes the provider enforce the shape rather than suggest it. Strict mode only accepts a subset: every object closed with `additionalProperties: false`, every declared property listed in `required`. A schema outside it came back as a 400 naming a field, reaching the caller as a failed run instead of as the mistake it is.

The adapter now validates the schema first and throws `NonStrictJsonSchemaError`, naming the object and what it lacks (`the object at properties.customer leaves "name" out of "required"`). Nothing downstream catches this: the default validator in the core reads the answer as JSON without a schema language, so dropping `strict` quietly would trade a loud 400 for a shape nobody verifies.

Gemini is unaffected: `responseJsonSchema` accepts either shape.
