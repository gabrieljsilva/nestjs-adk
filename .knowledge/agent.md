---
title: Agent
description: Definition and minimum composition of an agent
type: entity
status: target
tags: [core, agents, architecture]
---

An agent is an autonomous decision unit that receives a request, gathers context, chooses actions within its capabilities, and produces an observable result.

Every agent has this minimum composition:

- **Name:** its unique identity.
- **Description:** the purpose it serves.
- **Model:** the component that makes its decisions.

A prompt is optional. It adds instructions that guide the agent's behavior, but the agent can decide from the request and the context available to it.

Everything else is an optional capability or policy attached to this core. The agent owns its definition, but never stores state from a run in its instance.

## Execution policies

A policy is attached to the agent, never to its model:

- **Failover:** which model replaces the primary one after a failure. It is declared as an ordered queue of models, or as a callback that receives the failure and the attempts so far and returns the next model. Returning nothing ends the attempts.

The runtime keeps attempts and failures inside the run, applies the policy and emits an observable event on every switch. The model performs inference and knows nothing about fallbacks, agents or execution chains. See [[llm-model]].
