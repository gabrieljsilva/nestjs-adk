---
"@nestjs-adk/core": minor
---

The two journal events an application listens for are public.

`ToolCallRequested` and `ToolResultProduced` are exported, so a consumer of `PublishedEvent` matches `event.type` against `ToolCallRequested.TYPE` instead of a string it copied from the codec registry. The class already carries its name; the application no longer has to.
