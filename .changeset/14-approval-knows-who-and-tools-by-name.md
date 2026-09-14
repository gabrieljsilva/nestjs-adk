---
"@nestjs-adk/core": minor
---

The approval policy knows who is asking, and an agent lists a tool by name.

`AdkApprovalPolicy.requires(tool, invocation, actor)` receives the run's actor as a third argument, so a policy can let one person run what another has to confirm. `EffectApprovalPolicy` ignores it; a policy written before this release keeps compiling, since the argument is optional and unread.

`@Agent({ tools })` and `@McpController({ tools })` accept the name a tool declared beside its class. Both resolve to the same definition through `SharedToolLookup`, and a name nobody declared fails the boot with `UnregisteredToolError`, naming what was found. The string exists for the module that cannot import the class without closing a cycle.
