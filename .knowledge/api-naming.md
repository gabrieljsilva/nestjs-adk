---
title: API naming
description: Verb-first method names, factories that name their source, and the failure semantics a name has to carry
type: convention
status: target
tags: [core, api, naming]
---

A method name starts with a verb in the imperative. A noun names data, so a method named like data reads as a property that happens to be callable. This holds for private methods and statics as much as for the public surface.

## The verbs

Each verb promises something. Use the one whose promise the body keeps.

| Verb | Promises |
| --- | --- |
| `find` | a lookup that may answer nothing, so the return is optional |
| `get` | something already at hand: no I/O, never optional, never a synonym of `find` |
| `read` | pulling a value out of a payload, a transport or a store (`readRejectionReason`) |
| `build` | assembling a value in memory from what was passed (`buildDeclaration`) |
| `create` | producing a new durable thing, such as a session |
| `open` | making a thing usable, answering the same whether it existed or not (`openSession`) |
| `format`, `render` | turning a value into text for a reader |
| `emit`, `publish` | announcing an event, with the event named |
| `resolve` | asking a collaborator what a reference becomes this time (`resolveActiveAgent`) |
| `calculate` | arithmetic over values the caller already holds (`calculatePrice`) |
| `project` | folding a journal into a read shape, the word [[context-projection]] uses |
| `append` | writing one command onto a journal |
| `compact` | shrinking a projection under a budget |
| `execute` | running one use case, the single method a use case exposes |
| `dispose` | releasing what the instance holds |

A verb outside this table is allowed when its meaning is the dictionary's and nothing else in the lib uses it for something different. Add the row here when a second module adopts it.

Do not use `process`, `manage`, `do` or `handle`. Use `handle` only when the class implements a contract that names the method.

## Never `somethingOf` and never `somethingFor`

`priceOf(model)`, `declarationOf(schema)`, `codecFor(event)` are grammatical and say nothing about what happens to the argument. The fix is a verb, with the argument implied by the parameter:

```ts
// avoid
ZodToolSchema.declarationOf(schema);   // packages/core/src/adapters/schema/zod-tool-schema.adapter.ts:75
PricingSource.priceOf(model);          // packages/core/src/contracts/pricing/pricing-source.contract.ts:30
RunJournal.reasonOf(error);            // packages/core/src/runtime/run/journal/run-journal.service.ts:229

// prefer
ZodToolSchema.buildDeclaration(schema);
PricingSource.findPrice(model);
RunJournal.readRejectionReason(error);
```

`findPrice` and not `calculatePrice` on the contract, because the port answers `undefined` when it has no price for the model. `calculatePrice` is the right name where arithmetic happens over a rate the caller already holds.

The mechanical sweep is one command. A new hit is a review finding:

```bash
grep -rnE "\b[a-z][A-Za-z0-9]*(Of|For)\(" packages/*/src --exclude="*.spec.ts"
```

## The verb says what the method does, never when it is called

A name written from the caller's point of view becomes a lie at the second caller. `collectResult` describes what the loop around it is doing; `runTurn` describes what happens inside.

A name that says less than the body is renamed, not documented. See [[comments-and-jsdoc]].

## Factories name their source

`static of()` and `static create()` are forbidden. A static factory is `from<Source>`, and the source is what the value was converted from:

```ts
// avoid
ToolCallNotice.of(call, tool);     // packages/core/src/domain/tool/notice/tool-call.notice.ts:26

// prefer
ToolCallNotice.fromCall(call, tool);
```

`of` works for `Optional.of` because a container has exactly one possible source. Our classes do not: the moment a second source appears, `of` has nothing to disambiguate with and the pair stops matching. `create` names the direction of time instead of the input, and it already means persistence here.

When the class only assembles values the caller already holds, nothing is converted and there is no source to name. That case is the constructor:

```ts
// avoid: a static that renames the constructor
PromptTemplate.of(text, name);

// prefer
new PromptTemplate(text, name);
```

The test is one question: can you finish the sentence `from...`? If the honest answer is "from the arguments", it is a constructor.

A mapper or codec method names both ends: `fromRecord`, `toRecord`. Never a bare `map`, `convert`, `parse` or `transform`.

## Predicates

- `is`: current state, such as `isCancelled`.
- `has`: possession or existence, such as `hasPendingApproval`.
- `can`: capability at this moment, such as `canRetry`.
- `supports`: declared capability, such as `supportsStreaming`.
- `should`: policy decision, such as `shouldCompact`.
- `requires`: requirement, such as `requiresApproval`.

## Fallible lookups

Make absence explicit in the name. `find` returns an optional value; `findOrFail` returns the value or throws an error the module owns, see [[error-taxonomy]]. `load` and `loadOrFail` are the same pair when the lookup performs external I/O. Never use `get` to hide whether absence is possible.

## Class roles

The suffix of a class says which layer it sits in; see [[layered-responsibilities]] for the four layers and their suffixes. Inside a layer, use role names such as `Builder`, `Projector`, `Validator`, `Policy`, `Strategy`, `Codec`, `Loop`, `Executor` and `Gate` for focused collaborators. Do not call every class a service.

## What is still missing

Measured on 2026-09-14 over non-spec sources: 120 distinct `xxxOf` or `xxxFor` methods, 52 `static of()` factories and 3 `static from<Source>()` factories. The rename runs module by module, with the grep above as the countdown.
