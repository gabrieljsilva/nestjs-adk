---
"@nestjs-adk/core": minor
---

A placeholder stops naming tools the agent reading it may not have.

The sentence a model reads in place of an artifact used to list the exploration tools by name:

```text
[artifact a-1 "sales.csv", text/csv, 13480 characters, read with read_artifact(artifactId, offset, limit), or explore with outline_artifact, search_artifact and query_artifact]
```

That sentence is durable. It is written into `ToolResultProduced` and read back on every later turn, so it cannot know which agent will read it, and since those five tools became opt in it was naming tools an agent may never have been given. A model that acts on it spends a call being told the tool does not exist. It now says what it knows instead:

```text
[artifact a-1 "sales.csv", text/csv, 13480 characters, read with read_artifact(artifactId, offset, limit), and its shape is one the artifact exploration tools understand]
```

`read_artifact` is still named, because every agent that has tools at all has it, so that half is a promise the placeholder can keep. The rest is a fact about the content, and the model finds out what it can do with it from the tools it was actually given.

`list_artifacts` answers on the same rule: each entry carries an `explorable` boolean where it used to carry the list of tools that applied. A durable answer describing a catalog it cannot see is a wrong answer however carefully it is written.
