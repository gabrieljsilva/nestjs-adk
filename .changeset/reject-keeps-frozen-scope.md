---
"@nestjs-adk/core": patch
---

A rejected turn resumes with the scope it had, like an approved one does.

`approve()` passed the pending action's frozen `state` to the resumed run and `reject()` did not, so an agent with declared state crashed with `AgentStateMissingError` on the path where nothing even executes. The rejection resumes the SAME turn: the agent still has to wrap it up, and it cannot do that without the keys the paused run was carrying.

The asymmetry only surfaced on rejection, which is the branch a user reaches less often. Both verbs now shape the resume the same way.
