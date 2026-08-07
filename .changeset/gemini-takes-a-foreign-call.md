---
"@nestjs-adk/google": patch
---

A tool call written by another provider reaches Gemini 3 instead of killing the run.

Gemini 3 signs the function calls it generates and refuses a turn whose calls come back unsigned. A conversation that changed model has calls nobody here can sign, and there are three ways it gets one: a transfer to an agent running elsewhere, a `ModelResolver` routing a hop, and a failover rerouting the turn to the next model in the chain. All three ended the same way, with a 400 naming a tool.

The failover case was the worst of them. The 400 is a refused request, `SequentialFailoverPolicy` correctly stops the walk on one, and the run died with `ModelsExhaustedError` carrying a malformed-request message about a tool. The mechanism that exists to rescue the run was what ended it, and the reason pointed at the tool's schema.

`GeminiRequestMapper` now fills an unsigned call with `skip_thought_signature_validator`, the placeholder Google documents for transferring a trace from a different model. It is scoped the way Google scopes validation: the turn being answered only, and only the call that opens a step, since a parallel call after it is exempt. A signature the provider gave is never touched, and the placeholder never leaves the mapper, because a stored signature that is really a placeholder is worse than none.

Every model gets it except one whose name states a generation below 3, and that default was measured rather than assumed. `gemini-flash-latest` answers as `gemini-3.6-flash` and refuses an unsigned call, so treating Google's own moving alias as an old model would leave the bug in place for anyone following Google's naming. The opposite mistake costs nothing: `gemini-2.5-flash-lite` accepts a signature it never issued and answers normally.

Google discourages synthesised call blocks and warns the model reasons worse without the true signature. That trade is made for a handover the application never asked about, and for nothing else.
