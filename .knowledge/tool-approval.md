---
title: Tool approval
description: How a run stops in front of a human, what it stores while it waits, and what runs when the answer arrives
type: pattern
tags: [core, tools, hitl, sessions]
---

A tool that changes something in the world may need somebody to agree first. The approval policy decides which calls, the run decides when to stop, and the journal is what makes waiting survive a restart.

## The unit is the turn, not the call

A model that asked to look an order up and then to refund it meant one thing. If the lookup runs while the refund waits, three things break at once: an effect happened that nobody finished agreeing to, the journal holds a call with no result, and whoever approves the refund is deciding without knowing what already ran beside it.

So the whole turn stops. `ToolExecutor.allHeld` answers every call of the turn a policy holds, and the run suspends before executing any of them, held or not.

Releasing works the same way. A turn is decided when no held call is still awaiting an answer, and only then does anything run: granted calls execute in the order the model asked for them, denied ones produce their refusal as the result, and calls nobody had to answer for run alongside. A turn with two held calls and one answer stays suspended.

## Suspension is a fact, not a paused process

Nothing about a suspended run stays in memory. No timer holds it, a shutdown does not wait on it, and what continues the conversation later is a new run that points back at the old one through `PendingTurn.runId`.

`AgentRunSuspended` carries the whole turn as `PendingCall[]`: call id, tool name, arguments, and an effect on each call somebody has to answer for. Everything needed to run the turn later, in another process, is in that one event. Whoever resumes reads it and knows what has to happen, instead of reassembling a turn from the journal around it.

The arguments travel with it for one reason: what the human agreed to was that call with those arguments. Rebuilding a call from a guess, or asking the model again after the answer arrives, would run something nobody approved.

`ToolApprovalRequested` is the notification, one per held call, and holds no arguments. Duplicating them would only create a second place for them to disagree.

## The state is a projection, and it is what refuses a second decision

`SessionState.pendingTurn` comes from folding the journal: `AgentRunSuspended` sets the turn, `ToolApprovalGranted` and `ToolApprovalDenied` decide one call of it, and a run reaching a terminal event releases it.

A decision on a call that is not awaiting raises `ApprovalNotPendingError`. That is what a double click and a duplicated webhook hit. It is a real guarantee about decisions and a weaker one about effects: it means at most one decision, not exactly one execution. A process that dies between granting and executing loses the effect; one that dies after the effect and before the result cannot tell the difference. Making the second promise needs a claim with a lease and an idempotency key handed to the tool, and that does not exist yet.

## The gate is an error on purpose

`ToolExecutor.execute` throws `ToolApprovalRequiredError` before invoking the handler when it was not told the call is approved. It is an error rather than a return value so that no caller can read past the gate by accident, which is the one mistake the whole mechanism exists to prevent.

The run does not rely on catching it. It asks first, with `allHeld`, and the throw is the invariant behind the asking.

## Tools the runtime owns answer to no policy

`ToolDefinition.internal` marks a tool the runtime offers on its own behalf, like `read_artifact` and `activate_skill`. No approval policy applies to it, so a policy written for an application's tools cannot leave a model unable to read what it was told to read. Their results are never offloaded either: taking back out what was just fetched back in is a loop, not a saving.

Related: [[error-taxonomy]], [[context-projection]], [[layer-boundaries]].
