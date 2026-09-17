---
title: Structured output
description: Why an agent declares the shape of its answer instead of a call asking for one, and what a run does with the value
type: pattern
tags: [core, models, runs]
---

An agent that answers data declares the shape once, on itself:

```ts
@Agent({
  name: "titler",
  description: "Names a conversation.",
  outputSchema: {
    type: "object",
    properties: { title: { type: "string" } },
    required: ["title"],
    additionalProperties: false,
  },
})
export class TitlerAgent extends AdkAgent {}
```

`AgentResult.output` then carries the answer already parsed, beside the `text` it was parsed from.

## The schema is the agent's, never the call's

`AskOptions` deliberately has no schema, and the reason is where a scope comes from rather than taste. Three paths build a `RunScope` without the command that started the run: `TransferSessionUseCase` after a transfer, `DelegateAgentUseCase` for a subtask, and `DecideApprovalUseCase` for the turn that follows a human answering a tool call. A schema passed to `ask` would be absent in exactly those three, so a run that suspended for an approval would come back answering prose, intermittently, depending on whether a tool asked for one.

Declared on the agent, it lives on the `AgentDefinition`, and every one of those paths resolves the definition of whoever is about to answer. A transfer to an agent that answers prose answers prose, which is correct: the shape belongs to the agent doing the answering, not to the one that was asked first.

## How it reaches the provider

The path is the same one the prompt and the tool declarations take, and it exists because `ContextProjection.toRequest()` is the only place a `ModelRequest` is built:

```
AgentDefinition.outputSchema
  → TurnLoop.prepare              scope.definition.outputSchema
  → PrepareContextCommand
  → ContextService.prepare
  → ContextProjection             (kept by withBlocks, so compaction preserves it)
  → ModelRequest.outputSchema
  → the adapter                   response_format (OpenAI) / responseJsonSchema (Gemini)
```

`withBlocks` carrying it is not decoration: compaction replaces the blocks and returns another projection, and a compacted run that dropped the schema would answer prose on the one turn a long conversation needed it most.

## What each side is authoritative about

The scanner checks only that the declaration is an object. What a valid schema is belongs to the provider, and the OpenAI adapter already refuses the ones strict mode rejects, naming the field: every object closed with `additionalProperties: false` and every property listed in `required` (see [[agent-suites]]). Inventing a schema validator in the scanner would fail boots over rules only the provider decides.

`ModelExecutor.verify` refuses a model that does not declare `ModelCapability.STRUCTURED_OUTPUT` before calling it. A run failing there is the point: the alternative is prose nobody checked, arriving where a caller is about to read a field off it.

Providers disagree about more than the schema. DeepSeek answers `400 This response_format type is unavailable now` to `json_schema` while accepting JSON mode, and some OpenAI models refuse any `temperature` but the default. The adapter maps the request; which model can serve it is the application's choice.

## The journal keeps the text, not the value

`AssistantMessageProduced` records `outcome.response.text`, so what a session replays on the next turn is the raw JSON. The parsed value is a fact about one call and is not journaled: an event carrying it would be a second copy of the same answer, and the two could disagree after a codec change.

The consequence worth knowing: a second question in the same session shows the model its own JSON as conversational history. For an agent that always answers data that is consistent; for one that answers data sometimes, it is not, which is another reason the shape belongs to the agent.

Related: [[context-projection]], [[run-orchestration]], [[llm-model]], [[agent-suites]].
