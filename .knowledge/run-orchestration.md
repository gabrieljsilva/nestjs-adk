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

Under it, one class per use case: `AskAgentUseCase` for a question, `DecideApprovalUseCase` for an answer to a held turn. They are separate because the two share a consumer and nothing else: one opens a session and one continues from a suspension, one journals a question and one journals a decision.

## One decision per class

| Class | Owns | Owns nothing about |
| --- | --- | --- |
| `SessionOpener` | create or rehydrate, refuse a closed session, and answer which agent owns it now | what is then written to it |
| `ModelService` | which model answers a command, and whether it can read what the command attached | what is then sent to it |
| `ToolService` | the sources a run may use, for as long as the run lasts, and recording the ones that refused | what any tool does |
| `SessionService` | opening a conversation and reading one, outside any run | anything a run does in it |
| `RunScopeFactory` | the catalog, the limits and the breaker of one run | when any of them is used |
| `TurnLoop` | model, tools, model again, and when to stop | what the events look like |
| `TurnExecutor` | running the calls of one turn, in order | whether they were allowed |
| `ApprovalGate` | which calls of a turn somebody has to answer for | what happens next |
| `RunJournal` | every batch a run can write | when it is written |
| `RunSettler` | recording how a run ended, even against a moved head | why it ended |

The test for whether a split earns its file is whether the two halves change for different reasons. `RunJournal` changes when the journal shape changes; `TurnLoop` changes when the loop changes. They used to change together because they lived together.

## What a run resolved once travels as a value

`RunScope` carries what a run *resolved* before it began: definition, model, started run, catalog, skills, limits and breaker. Without it, every signature grew to seven parameters and every new capability changed all of them.

What it does not carry is where the run is happening. That is a `RunContext`, built once in the use case and held by the scope rather than copied into it, so `sessionId`, `actor`, `signal` and `run` are getters onto one value instead of four fields that can drift. See [[run-context]] for the two halves, the lifecycle and the rule that no service keeps one in a field.

`TurnLoop.commit` answers with a scope rather than nothing, because a tool of the turn may have written session metadata: the fold moves on that commit, and the rest of the run has to read what it wrote.

The breaker travels there too, and it is the one mutable thing in the bundle. It counts within one run and means nothing outside it, so it has the same lifetime as everything beside it.

`RunJournal` deliberately does **not** take a `RunScope`. `AgentRunStarted` has to be written before the scope exists, because the scope needs the tools the sources opened and the sources open after the question is durable. A dependency that fits nine methods and fails two is not a dependency.

## A use case is a sequence of awaits

`AskAgentUseCase.execute` contains no loop, no nested `if`, no arithmetic and no `try/finally`. Every step is one call on a service whose name says what the step is, and each of those services owns the branch that used to be written out here:

- `SessionOpener.enter` answers with the conversation *and* the agent that owns it, so the use case never compares an active agent with a called one;
- `TransferGate.resolve` answers with a `Handover`, so a command that transfers and a command that does not take the same line;
- `ModelService.resolve` picks the model and refuses an attachment it cannot read, because a caller asking for the model of a run is asking for one that can read what the run carries;
- `ToolService.withSources` opens the sources and closes them however the body ends;
- `AgentRunFactory.untilFinished` releases the run however it ends;
- `RunSettler.settling` records the ending of everything after the first commit.

The last three are `try/finally` and `try/catch` that used to sit in the use case. Written there, each one was a guarantee the next use case had to remember to write again; written here, it is the only way to call the body at all.

## Ordering is a decision, and it lives in the use case

The order in `AskAgentUseCase` is the design, not an implementation detail:

1. the run is registered before storage is touched, so a draining runtime never creates a session for a command it is about to refuse;
2. the question is journaled before anything else can fail, so a run that dies opening a tool source leaves the question recorded and an ending recorded after it;
3. everything from there on is inside the `catch` that settles, so every ending a run can reach is written down;
4. the run leaves the active set however it settles, so a shutdown draining on it is not waiting on something already over.

Moving step 2 after step 3 is the kind of change that looks like tidying and silently removes a guarantee. It is written here because the code cannot say it.

## A conversation may exist before any run happens in it

An application that already identifies its conversations, a chat row being the usual one, opens the session itself through `SessionService.create`. That splits what used to be one act into two, and the split is only safe because of where the line falls.

`createSession` writes the **head** and nothing else. The journal still begins with the first question, because `EventCorrelation.runId` is required on every event and a conversation opened outside a run has no run to name. A `SessionCreated` invented there would point at a run that never existed.

So `OpenedSession.isNew` is not "I created this in this call". It is **"this journal has no beginning recorded yet"**, and `SessionOpener` reads it off the session's revision rather than off its own memory. Three situations land in it and all three need the same thing:

- a session created by the very command being run;
- a session opened by `createSession` minutes or days earlier;
- a session whose head was written by a run that then died before committing, which under the old reading could never record its beginning again.

`RunJournal.opening` writes the metadata the command carried before the question itself, so a reader of the journal has the facts the turn ran under before it has the turn, and a run that fails loses the write together with the turn. `SessionCreated` and `UserMessageReceived` carry `command.actor?.id` and only the id: an actor's claims are the application's vocabulary, read by a policy at the moment of the call, and a copy of them frozen in a journal would be an authorization decision nobody revisits. See [[session-metadata]].

What deliberately did **not** change is `ask`. A question naming a session that does not exist is still refused. Creating on an unknown id would read as convenience and cost the only signal that separates a stale identifier from a legitimate one, which is the same argument that keeps `InspectSessionUseCase` refusing rather than answering empty.

## A run has one way to be stopped from outside

`AgentRunFactory` is where a run's `RunCancellation` is born, and therefore the only place a caller's `AbortSignal` is chained onto it. `start` and `resume` both take one, so an approval, which is a run of its own minutes or days later, is as cancellable as the question that suspended.

The tracker keeps `cancelAll` for the shutdown drain and gains no `cancel(runId)`. A run id only exists once the run has begun, and the stop button is usually pressed before the first chunk: a signal that already aborted cancels the run before it calls anything, which a lookup by id cannot express.

A cancelled run ends by throwing, and `RunJournal.terminal` reads the cancellation to write `AgentRunCancelled` instead of `AgentRunFailed`. That distinction is the whole reason the signal goes here rather than being handled at the public surface: a caller that only stopped reading leaves a run that completed normally in the journal, which is a lie about what the provider was paid for.

## The loop has a ceiling nobody has to ask for

`RunLimits.maxIterations` is fifty unless somebody says otherwise, and that is the module default in `RuntimeOptions`, overridden by the agent and then by the call the same way every other limit is.

It used to be absent, which read as trust and behaved as a bill. A model looping on a tool it cannot satisfy is not an exotic failure, it is a Tuesday, and absence meant nobody found out until the invoice. Fifty is high enough that no honest agent reaches it and low enough that a loop is paid for once.

Taking it off is still a real answer, and it is `RunLimits.unbounded()` rather than leaving a field out: an indefinite run is a decision, so it is written down where a reviewer sees it. The other two caps are unchanged, since `maxConsecutiveToolFailures` is absent by default and `maxInvalidArgs` was always on at two.

## Tests build the assembly, not the pieces

`NativeStackFixture` wires the whole native stack the way the composition wires it. A suite that assembles the pieces itself proves the pieces, and the assembly is where an ordering mistake actually lives.

Related: [[run-context]], [[tool-approval]], [[context-projection]], [[layer-boundaries]], [[services-over-functions]].
