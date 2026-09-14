---
"@nestjs-adk/core": minor
"@nestjs-adk/openai": minor
---

A thinking model's reasoning comes back with the call it led to.

DeepSeek streams `reasoning_content` ahead of a tool call and refuses the next request of the same turn unless the assistant message replaying the call brings it back. The refusal is a 400 the failover policy correctly stops on, so an approved call resumed a turn later died as `ModelsExhaustedError` naming a malformed request.

The OpenAI adapter now gathers the reasoning of one stream in an `OpenAiReasoningTrace` and hands it to the first tool call that opens, as that call's signature: the opaque slot a provider's own bookkeeping already had. It never reaches the answer's text. On the way back, `OpenAiRequestMapper` folds calls the model made in one breath into one assistant turn with several `tool_calls`, which is the shape it produced them in, and sets `reasoning_content` on that turn when a call carries a signature. The turn also carries `content: ""`, which DeepSeek's validation expects on the message it returned; the field missing was refused with the same error as the reasoning missing.

## Calls made in one breath stay together

`ContextProjector` used to give every call its own block, the result folded in behind it, so three calls the model made at once were read back as three assistant turns, each answered before the next was asked. Every provider produced them as one turn with three calls, and a thinking model attaches its reasoning to that one turn: split, two thirds of them were turns it never reasoned about, and DeepSeek refused the request. Calls requested back to back with nothing conversational between them now share one `ContextBlock`, calls first and results after all of them, closed when the last is answered; `ContextBlock.alsoCalling` is how the block grows. Compaction's unit is unchanged: the breath is still the smallest thing that may be dropped or kept.

`OpenAiOptions.replaysReasoning` decides whether it is sent. Unset, it follows `baseURL`: a compatible endpoint gets it and the official API, which refuses a message field it does not know, does not.
