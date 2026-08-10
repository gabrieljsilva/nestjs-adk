---
"@nestjs-adk/google": minor
---

Gemini takes a call another provider wrote, and fetches a remote file by URL.

## A foreign tool call no longer kills the run

Gemini 3 signs the function calls it generates and refuses a turn whose calls come back unsigned. A conversation that changed model has calls nobody here can sign, and there are three ways it gets one: a transfer to an agent running elsewhere, a `ModelResolver` routing a hop, and a failover rerouting the turn to the next model in the chain. All three ended the same way, with a 400 naming a tool.

The failover case was the worst of them. The 400 is a refused request, `SequentialFailoverPolicy` correctly stops the walk on one, and the run died with `ModelsExhaustedError` carrying a malformed-request message about a tool. The mechanism that exists to rescue the run was what ended it, and the reason pointed at the tool's schema.

`GeminiRequestMapper` now fills an unsigned call with `skip_thought_signature_validator`, the placeholder Google documents for transferring a trace from a different model. It is scoped the way Google scopes validation: the turn being answered only, and only the call that opens a step, since a parallel call after it is exempt. A signature the provider gave is never touched, and the placeholder never leaves the mapper, because a stored signature that is really a placeholder is worse than none.

Every model gets it except one whose name states a generation below 3, and that default was measured rather than assumed. `gemini-flash-latest` answers as `gemini-3.6-flash` and refuses an unsigned call, so treating Google's own moving alias as an old model would leave the bug in place for anyone following Google's naming. The opposite mistake costs nothing: `gemini-2.5-flash-lite` accepts a signature it never issued and answers normally.

Google discourages synthesised call blocks and warns the model reasons worse without the true signature. That trade is made for a handover the application never asked about, and for nothing else.

## `MEDIA_URL` is declared

`fileUri` used to take only Google's own Files API, so a remote link handed to Gemini was a string nobody fetched. Since January 2026 the API fetches files from public HTTPS addresses and from signed URLs, with S3 pre-signed and Azure SAS named explicitly, and the request mapper already sends a remote part exactly that way. With the capability declared, `SignedUrlAttachmentResolver` mints a fresh address for a turn Gemini serves instead of replacing the image with a note.

One reliability note: `googleapis/js-genai#1385` reports intermittent "Cannot fetch content from the provided URL" for S3 pre-signed URIs, where the URL stays valid and a retry succeeds. An application running signed URLs against Gemini should expect to retry that failure.
