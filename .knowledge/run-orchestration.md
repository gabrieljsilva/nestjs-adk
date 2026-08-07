---
title: Run orchestration
description: How a command becomes a run, which class owns which decision, and why the public surface holds none of them
type: pattern
tags: [core, runtime, runs]
---

One command against an agent touches storage, a provider, tools, a human and a journal. Splitting that is not decoration: it is what keeps the class an application depends on from being the class that also decides in what order things happen.

The shape mirrors what a NestJS application does with HTTP. A controller receives and returns; a use case orchestrates one case end to end; a service does one thing and says so in its name; a repository owns persistence. Here the words differ and the layering does not.

## The public surface holds no orchestration

`AgentRunner` has three methods and no logic. It is the name a consumer holds, and a name that also decides ordering cannot change without changing what callers depend on.

Under it, one class per use case: `AskAgent` for a question, `DecideApproval` for an answer to a held turn. They are separate because the two share a consumer and nothing else: one opens a session and one continues from a suspension, one journals a question and one journals a decision.

## One decision per class

| Class | Owns | Owns nothing about |
| --- | --- | --- |
| `SessionOpener` | create or rehydrate, refuse a closed session | what is then written to it |
| `RunScopeFactory` | the catalog, the limits and the breaker of one run | when any of them is used |
| `TurnLoop` | model, tools, model again, and when to stop | what the events look like |
| `TurnExecutor` | running the calls of one turn, in order | whether they were allowed |
| `ApprovalGate` | which calls of a turn somebody has to answer for | what happens next |
| `RunJournal` | every batch a run can write | when it is written |
| `RunSettler` | recording how a run ended, even against a moved head | why it ended |

The test for whether a split earns its file is whether the two halves change for different reasons. `RunJournal` changes when the journal shape changes; `TurnLoop` changes when the loop changes. They used to change together because they lived together.

## What a run resolved once travels as a value

`RunScope` carries what a run decided before it began: definition, model, started run, catalog, skills, limits and breaker. Without it, every signature grew to seven parameters and every new capability changed all of them.

The breaker travels there too, and it is the one mutable thing in the bundle. It counts within one run and means nothing outside it, so it has the same lifetime as everything beside it.

`RunJournal` deliberately does **not** take a `RunScope`. `AgentRunStarted` has to be written before the scope exists, because the scope needs the tools the sources opened and the sources open after the question is durable. A dependency that fits nine methods and fails two is not a dependency.

## Ordering is a decision, and it lives in the use case

The order in `AskAgent` is the design, not an implementation detail:

1. the run is registered before storage is touched, so a draining runtime never creates a session for a command it is about to refuse;
2. the question is journaled before anything else can fail, so a run that dies opening a tool source leaves the question recorded and an ending recorded after it;
3. everything from there on is inside the `catch` that settles, so every ending a run can reach is written down;
4. the run leaves the active set however it settles, so a shutdown draining on it is not waiting on something already over.

Moving step 2 after step 3 is the kind of change that looks like tidying and silently removes a guarantee. It is written here because the code cannot say it.

## A run has one way to be stopped from outside

`AgentRunFactory` is where a run's `RunCancellation` is born, and therefore the only place a caller's `AbortSignal` is chained onto it. `start` and `resume` both take one, so an approval, which is a run of its own minutes or days later, is as cancellable as the question that suspended.

The tracker keeps `cancelAll` for the shutdown drain and gains no `cancel(runId)`. A run id only exists once the run has begun, and the stop button is usually pressed before the first chunk: a signal that already aborted cancels the run before it calls anything, which a lookup by id cannot express.

A cancelled run ends by throwing, and `RunJournal.terminal` reads the cancellation to write `AgentRunCancelled` instead of `AgentRunFailed`. That distinction is the whole reason the signal goes here rather than being handled at the public surface: a caller that only stopped reading leaves a run that completed normally in the journal, which is a lie about what the provider was paid for.

## Tests build the assembly, not the pieces

`NativeStackFixture` wires the whole native stack the way the composition wires it. A suite that assembles the pieces itself proves the pieces, and the assembly is where an ordering mistake actually lives.

Related: [[tool-approval]], [[context-projection]], [[layer-boundaries]], [[services-over-functions]].
