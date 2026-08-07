---
"@nestjs-adk/core": major
---

A transferred session stays transferred, and a declared field that is wrong fails the boot.

## Breaking: the session decides who answers, not the handle

A transfer used to last exactly one turn. It wrote the new owner into the session and then `ask` ignored it, so the next question was answered by whichever agent handle the application happened to call:

```ts
await concierge.ask("meu controle quebrou");        // warranty answers, and owns the session
await concierge.ask("e o prazo?", { sessionId });   // before: concierge answered. Now: warranty does.
```

Which handle was called only decides anything when there is no session yet, and then it decides the root agent. Two things follow. A handover now means something after the turn it happened in, which is what the declared graph was for: reaching a different handle was a way around it. And the owner recorded in the session no longer disagrees with the agent that just spoke, which was a real defect: a run that suspended for approval could be resumed by a different agent than the one that asked for it, because `decide-approval` reads the owner and `ask` did not.

To move a session from code, use `AgentRunCommand.transferTo`. It goes through the same gate the model's `transfer_to_agent` does, so a handover nobody declared is still refused.

Ownership is derived rather than stored twice: `AgentTransferred` in the journal is the truth, `SessionState.activeAgent` is the projection, and the snapshot is a disposable cache.

## Breaking: `@Agent` refuses a field it cannot use

Leaving a field out still means the default, which is what defaults are for. Declaring one the runtime cannot use now fails at boot with `InvalidAgentMetadataError` naming the provider and the field, instead of falling back to the default in silence while the developer believes the agent is configured:

```ts
@Agent({ name: "sales", description: "Sells.", model: "gpt-5.6-luna" })  // a name is not a model
```

It covers `model`, `prompt`, `compaction`, `tools` and `failover`, and a failover list says which entry is wrong rather than cancelling the whole chain over one typo.

## Fixed: a delegation journals the model that served it

`DelegationRunner` resolved the child's model twice, once to run the turn and once to write it down. A `ModelResolver` routing by load, cost or time answers two different questions when asked twice, so the journal could name a model that never served the turn. It is resolved once and carried.
