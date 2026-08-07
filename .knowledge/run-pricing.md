---
title: Run pricing
description: Where a call is collected, when it is priced, and why nothing about a bill can fail a run
type: pattern
tags: [core, cost, pricing, runtime]
---

Pricing is split in two on purpose: what happened is collected while the run runs, and what it cost is computed once the run is over.

## Collecting

`TurnLoop` appends a `BilledCall` to `RunProgress` right after the turn is journaled. A `BilledCall` is a model identity plus a `ModelUsage` and holds no money, because turning tokens into money means asking a source, and a source is I/O. A turn loop that awaited a catalog between turns would pay for it on the critical path of every iteration.

The identity is `outcome.servedBy`, taken from the response and not from the agent's declaration. After a reroute those are different models, and the bill belongs to the one that did the work.

A delegation hands its calls up to the parent with `progress.charged(...childProgress.billed)`, immediately after the child's loop returns and before the suspension check: what the child spent was spent, whichever way it ended. The parent's total then includes the child once, and the child's model stays a separate entry in `byModel`.

## Pricing

`RunResultFactory` is the only place a run is priced, and it runs after the loop. It exists because three commands (`AskAgent`, `DecideApproval`, `DelegateAgent`) used to assemble the same result inline, and adding an `await` to each would have put the same catalog call in three places.

`RunCostReporter` asks the source once per distinct model, however many calls it served, and checks usage before price: a call the provider reported nothing for has no price whatever a catalog says, and skipping it early keeps the source from being asked about a model it cannot help with.

## Nothing about a bill fails a run

Every way pricing can go wrong ends the same way: the model is named in `RunCost.unpriced`, its tokens stay out of the total, `isComplete` answers false, and a `ModelUnpriced` reaches the sink. No source declared, a source that does not know the model, a source that throws, a provider that reported no usage, a catalog payload that is not a catalog: all of them are reports, and a report is never worth a conversation.

The sink follows the same rule as every other notice sink in the runtime. It is off the path of every decision, and a sink that throws does not take the run with it. See [[money-precision]] for why a zero is never read as free, and [[error-taxonomy]] for the difference between an error and a survivable failure.

## One source, no overrides

There is one `PricingSource` for the whole module, declared in `RuntimeOptions`. There is deliberately no per agent and no per model override: a bill that can be overridden in three places is a bill nobody can explain. A consumer that needs negotiated rates, a persisted catalog or a different currency writes a source, which is why the port is public.
