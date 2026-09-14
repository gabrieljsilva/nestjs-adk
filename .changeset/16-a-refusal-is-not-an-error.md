---
"@nestjs-adk/core": minor
---

A refused call is answered as a refusal, not as an error.

A call the person denied, or the access policy refused, used to reach the model as `{ error: "<reason>" }`, the same result a tool that broke produces. A model cannot tell the two apart on the wire, and it behaves like it was told of an error: it explains a fault it never saw and retries, while the prompt is asking it to say the action was refused. Both now produce `{ refused: true, reason }`, still marked failed so the model does not ask again. `ToolOutcome.refused` is the factory, next to `failed`, and `{ error }` keeps meaning what it meant: the call ran and broke, or the arguments were invalid.

An application that read `output.error` off a denied call reads `output.reason` now.
