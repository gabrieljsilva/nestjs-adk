---
title: Agent delegation
description: How one agent has another answer a single task, why neither reads the other's conversation, and where the runtime's only dependency cycle lives
type: pattern
tags: [core, agents, sessions, delegation]
---

Delegation is an agent asking a specialist one question and carrying on with the answer. It is the opposite of a transfer, and one sentence separates them: **a delegation never changes the active agent of the session**.

`@DelegatesTo(ResearcherAgent)` declares the edge, in the same three forms and with the same resolution as a transfer: see [[agent-transfer]].

## A delegation is a run

The child has its own agent, model, tools, context and budget. What makes it a delegation rather than a second conversation is that it happens inside the parent's run, writes to the same journal, and hands its answer back as the result of the call that asked for it.

`AgentRun.delegated` gives the child a new id, the parent's id as `parentRunId`, the delegation's `CorrelationId`, and `parent.depth + 1`. Every event the child writes carries its own run id in the correlation, so the two runs are separable in the journal by reading it, not by guessing.

## Neither side reads the other's conversation

`ContextProjector` learns which runs are delegated from `DelegationStarted` as it scans, and filters on that:

- for the **parent**, every event belonging to a delegated run is skipped. It asked a question and got an answer; how the child got there is not part of its conversation.
- for the **child**, the context *begins* at its own `DelegationStarted`. Everything the parent said before is discarded, and the child's own `UserMessageReceived` (the task) is where it starts reading.

This is why the task travels as a tool argument. The child does not read the conversation, so whatever it needs to know has to be in those words. A delegation with an empty task is refused at parse time.

## Usage is counted once because nothing aggregates it

Both runs write `AssistantMessageProduced` with their own measurement into the same journal. Summing the journal therefore counts each model call exactly once. There is no aggregation step, and that is the point: an aggregation is a place where a number can be counted twice.

## Limits and cancellation

The child's limits are resolved from scratch for the child agent, not inherited: a delegation is separate work with a separate budget, and the parent's remaining iterations say nothing about how many the child needs. It gets a fresh `ToolBreaker` for the same reason.

Cancellation runs one way. Aborting the parent aborts the child, because a child nobody is waiting for is work somebody is still paying for. The reverse does not hold: a child that failed is an answer the parent still has to deal with.

Depth is capped at 3, checked before a child run exists. Like the transfer cap and unlike the iteration limit, it is not opt in.

## The one cycle in the graph

A loop runs turns, a turn delegates, a delegation runs turns. No construction order breaks that, so it is made explicit instead of implied:

- `DelegatedTurnLoop` is the half of the loop a delegation is allowed to reach.
- The composition calls `delegations.uses(loop)` immediately after building the loop.
- A runner that was never bound throws `DelegationUnboundError` rather than returning silence.

## Two consequences worth knowing

**Delegations run before the turn's other tools**, not in call order. A delegation commits to the journal as it runs, and interleaving those commits with results the executor has not returned yet would put the parent's answers in the journal before the questions that produced them.

**A delegated run that suspends fails** with `DelegationSuspendedError`. Approval resumes a run by opening a new one that points back at the suspended one, and a child run has no entry point: it only exists inside the turn that asked for it. Swallowing the suspension would leave a session reading as awaiting a decision nobody can act on. An agent that needs approval inside delegated work should be reached by transfer instead.

Related: [[agent-transfer]], [[run-orchestration]], [[context-projection]].
