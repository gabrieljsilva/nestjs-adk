---
"@nestjs-adk/openai": minor
"@nestjs-adk/testing": patch
---

A compatible endpoint says what it can see, and two contract suites can share one database.

`OpenAiOptions.capabilities` takes `{ mediaInput?, mediaUrl? }`. Left out, the adapter keeps assuming the official API, which reads images and fetches them by URL. `OpenAiModel` is also the door to Groq, Together, OpenRouter, DeepSeek and Ollama, and "compatible with OpenAI" covers an endpoint with no vision at all; there the guard passed and the refusal came from the provider, already paid. `{ mediaInput: false }` makes `ModelService` refuse the image before the session is opened, the same way it does for a model that never declared the capability.

`SessionStorageContractSuite` and `ArtifactStorageContractSuite` prefix every session id with a token picked per suite instance. Both used `s-1` and `s-2`, so two files measuring two stores against one database in parallel truncated each other's rows, and the failure landed on whichever lost the race. The `types` of the `@nestjs-adk/testing/matchers` subpath points at the file the build emits, `matchers.support.d.ts`, so the matcher augmentation types again.
