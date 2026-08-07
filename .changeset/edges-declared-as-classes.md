---
"@nestjs-adk/core": minor
---

`@TransfersTo` and `@DelegatesTo` take the agent class, not only its name.

```ts
@TransfersTo(SalesAgent, WarrantyAgent)
@DelegatesTo(BillingAgent)
export class ConciergeAgent extends AdkAgent {}
```

Renaming an agent now follows on its own, the editor finds the declaration, and a target that does not exist fails the build instead of the boot. A string was fragile in the way a string always is: `@TransfersTo("biling")` compiled fine and only spoke up when the application started.

Two agents that reach each other cannot name each other directly, because a decorator runs while its own class is being defined and the other end is still `undefined` at that point. Pass a function there, the same shape an ORM uses for a relation that points back:

```ts
@TransfersTo(() => BillingAgent)
```

That works because the decorator only stores what it was handed. Resolution happens during the scan, in `onModuleInit`, once every module has loaded. Doing it in the decorator would make the function worth nothing.

Plain names still work and nothing existing breaks. They remain the only form for an agent whose class a module does not import, and they are what travels on the wire, since the model transfers by calling `transfer_to_agent` with a name.

A class that never declared `@Agent` is now `InvalidAgentMetadataError` at boot, naming the class. A function that throws while it is being read reports what it threw and carries the original error as `cause`, because a cycle that genuinely failed to resolve is the one mistake this form exists to help with, and answering it with "does not declare @Agent" would send the reader to a decorator that is already there.

Whatever form is used, the target still has to be a registered provider: a class proves the agent exists, not that anybody registered it, so `UnknownTransferTargetError` stays.
