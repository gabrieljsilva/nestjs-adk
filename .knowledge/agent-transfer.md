---
title: Agent transfer
description: How a session changes hands, how an edge is declared and when it is resolved, and what a handover deliberately does not change
type: pattern
tags: [core, agents, sessions, transfer]
---

A conversation can end up belonging to a different agent than the one it started with. Transfer is how, and the whole design is about keeping that move narrow: declared in advance, checked in one place, and recorded as a fact rather than held in memory.

## Edges are declared, directed and closed

`@TransfersTo(BillingAgent, EscalationAgent)` declares the agents this one may hand a session to. Nothing else is reachable. There is no implicit edge back to whoever transferred here, because the way back is a decision the receiving agent has to make on purpose.

## An edge is declared as a class and resolved at the scan

Name the class. Renaming the agent then follows on its own, the editor finds the declaration, and a target that does not exist fails the build instead of the boot.

Two agents that reach each other cannot name each other directly: a decorator runs while its own class is being defined, so the other end is still `undefined` at that moment. Pass a function there and it is called later, which is the shape an ORM uses for a relation that points back.

```ts
@TransfersTo(() => BillingAgent)   // billing transfers back to this one
```

That is why resolution lives in `AgentTargets` and not in the decorator: the decorator only stores what it was given. `TransferMetadata.from` turns it into names during the scan, in `onModuleInit`, when every module has finished loading. Resolving in the decorator would make the function worth nothing.

A plain name still works, and is the only form for an agent whose class this module does not import. It is also what travels on the wire, since the model transfers by calling `transfer_to_agent` with a name.

Whichever form is used, the target still has to be a registered provider. A class proves the agent exists, not that anybody registered it, so a target that reaches no registered agent fails at boot with `UnknownTransferTargetError`, not halfway through somebody's conversation. A class without `@Agent` fails earlier still, with `InvalidAgentMetadataError` naming the class.

## The session remembers who owns it

A handover outlives the turn it happened in. `AgentTransferred` moves ownership, `StateProjector` reads it back into `SessionState.activeAgent`, and the next question on that session is answered by the owner:

```ts
await concierge.ask("meu controle quebrou");                 // transfers to warranty
await concierge.ask("e o prazo?", { sessionId });            // warranty answers
```

Which handle the application called only decides anything when there is no session yet, and then it decides the root. Answering as the agent the caller named instead would let any code walk around the declared graph by holding a different handle, and would leave the owner recorded in the session disagreeing with the agent that just spoke, which is what a resumed approval reads.

Ownership is derived, not stored twice: the journal is the truth, the snapshot is a cache, and `StateProjector.VERSION` throws every snapshot away when the rule changes. See [[session-snapshots]].

To move the session from code, use `AgentRunCommand.transferTo`, which goes through the same gate as the model's. Reaching for a different handle is not a way around it.

## Two ways in, one gate

The model transfers by calling `transfer_to_agent`, which is only declared to an agent that has edges and whose schema enum holds exactly those targets. An invented target never reaches the handler: it fails as invalid arguments, so a refused handover journals nothing at all.

Code transfers with `AgentRunCommand.transferTo`, checked before the first commit of the run. Both paths go through `TransferGate`. A check that lived in only one of them would be a boundary with a door around the side.

The tool itself moves nothing. It confirms to the model and stops there, because `ToolContext` is a value with no handle onto the runtime. What moves the session is `AgentTransferred` in the journal.

## A handover changes who answers, not which run

`AgentSwitch` reads the transfer from the batch that was just committed and rebuilds the `RunScope` around the agent that received the session. Tools, skills and instructions come from the receiver. The run id, the session id, the cancellation, the resolved limits and the tool breaker all stay.

Two of those are deliberate rather than incidental:

- **Limits do not widen.** They were resolved for this run, and an agent with a laxer limit must not be a way around the limit the run already had.
- **The breaker keeps counting.** Failures already seen still count, so a handover is not a way to reset a tool that keeps failing.

What the run's tool sources opened travels across too: `RunScope.remote` exists for exactly that, because a source belongs to the run and not to whoever happens to be answering.

## The count is read from the batch, not from the state

`SessionState.activeAgent` also changes on a transfer, but it carries the active agent of every previous run as well. A loop reading it would confuse "this session has belonged to billing since yesterday" with "this turn just transferred". The `AgentTransferred` event in the committed batch is the only reading with no ambiguity.

## The cap is not opt in

Eight transfers per run, then `AgentMaxTransfersError`. Unlike the iteration limit, nobody has to ask for it: two agents that each think the other should answer will hand a question back and forth forever, and every hop is a model call somebody pays for. A cycle is never what the developer meant.

## Declaring an edge requires a tools-capable model

`@TransfersTo` means this model may transfer, so the transfer tool is declared and the model needs the tools capability, even for an agent that only ever receives transfers by code. This is also why an agent with no tools, no on-demand skills and no edges gets an empty catalog: there is nothing to offer it.

Related: [[tool-approval]], [[run-orchestration]].
