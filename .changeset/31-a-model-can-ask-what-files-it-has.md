---
"@nestjs-adk/core": major
"@nestjs-adk/testing": minor
---

A model can ask what files it has.

`list_artifacts` joins the artifact tools. It takes nothing and answers the session's artifacts, newest first: id, name, type, size, and which tools read each one under the offload policy. It exists because the only ids a model knew were the ones it had seen in a placeholder, and a file attached before the conversation was compacted, or attached outside a question, had no line left to be seen in. Like the others it is `internal`, resolves inside the session that asked, and fits its answer to the offload budget. It stops at a hundred entries and says `truncated`.

**Breaking:** `ArtifactStorage` gains `list(context, limit)`, abstract. It answers the session's references, newest first, never more than `limit`, and an empty list for a session that owns nothing. `ArtifactStorageContractSuite` gains "lists only what the session owns, newest first, up to the bound". The two shipped stores implement it; an adapter written outside this package has to.
