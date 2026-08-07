---
title: Money precision
description: Why an amount is an integer count of pico dollars in a bigint, and where the single lossy step is allowed to be
type: pitfall
tags: [core, cost, pricing]
sources:
  - https://raw.githubusercontent.com/BerriAI/litellm/main/model_prices_and_context_window.json
---

Never hold an amount of money as a `number`. `UsdAmount` is an exact integer count of pico dollars (`1e-12`) in a `bigint`, and every arithmetic step on money happens in that unit.

The unit was measured against the real catalog rather than chosen. Of the 5345 rates LiteLLM publishes, a nano dollar unit (`1e-9`) truncates 103 of them to something they are not, and truncates the cheapest, `1.3e-10` per token, to zero. Pico loses none. Going finer is worse rather than better: multiplying a published rate by `1e15` leaves float64 exactness behind, so femto reintroduces the error it was meant to avoid.

The count is a `bigint` and not a `number` because `Number.MAX_SAFE_INTEGER` in pico dollars is about 9007 dollars. One run never reaches that; an accumulator that lives for a month does.

## The one lossy step

Exactly one conversion from float is allowed, and it is `TokenRate.fromUsdPerToken`, at the boundary where a published rate arrives as JSON:

```ts
public static fromUsdPerToken(usdPerToken: number): TokenRate {
    return new TokenRate(BigInt(Math.round(usdPerToken * PICO_PER_USD)));
}
```

Everything after it is integer arithmetic. A second float step anywhere downstream throws the guarantee away, so a helper that takes a rate as a `number` and multiplies it by a token count is a bug even when its output looks right.

## Reading an amount back

- `toString()` is the exact decimal, no exponent and no trailing zeroes. It is what a `NUMERIC` column and a ledger want, and it is what `toJSON()` answers.
- `pico` is the exact integer, for arithmetic a consumer does itself.
- `toNumber()` is lossy and documented as such. It is for a chart or a log line and never for a bill.

A `bigint` cannot be serialized by `JSON.stringify`, so anything that can reach a response body needs `toJSON`. `AgentResult.cost` reaches one whenever a controller returns a result unchanged, which is what the playground does.

## Zero is not free

An amount of zero says nothing on its own. A run nobody could price and a run that was genuinely free read identically, so the reason is carried apart: what could not be priced is named in `RunCost.unpriced`, `isComplete` answers false, and a `ModelUnpriced` reaches the notice sink. Never fill a gap with an estimate, including a token count guessed from characters. See [[error-taxonomy]] for why none of this throws.
