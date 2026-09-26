---
"@nestjs-adk/core": minor
---

An agent asks for the tools it reads files with, and a declaration stops being a tax on every agent.

Six tools reached every agent that had any tool at all, and five of them were of no use to an agent nobody ever sends a file to. A tool declaration is prompt paid on every turn: the six measure 5 524 characters of name, description and schema, and `ContextMeasurer` counts all of it in the prefix. Now `read_artifact` is the only one every agent gets, because a placeholder naming an artifact no tool can open is worse than no attachment, and the other five are listed on the agent that needs them:

```ts
@Agent({ name: "analyst", description: "...", tools: [LookupOrderTool, ...ArtifactExplorationTools] })
@Agent({ name: "importer", description: "...", tools: [OutlineArtifactTool, SliceArtifactTool] })
```

`ListArtifactsTool`, `OutlineArtifactTool`, `SearchArtifactTool`, `QueryArtifactTool` and `SliceArtifactTool` are exported, and `ArtifactExplorationTools` is the five together for an agent that should open whatever it is handed. Listing the class does not instantiate anything: it declares a `RuntimeToolRequest` carrying the name, the description and the schema the model reads, and the runtime swaps it for the tool bound to the store it composed when it builds the catalog for the run. So the declaration lives once beside the code, and an application never holds the artifact store, the offload policy or the budget to get a tool that uses them. Outside a container, `SearchArtifactTool.request()` goes straight into `AgentDefinitionInput.tools`. The swap is by name, and a `RuntimeToolRequest` in the list is what says which names to swap. `RuntimeTools.bind` reads the names off the declared requests, selects the bound tools by those names, and the catalog keys every tool by name with the last entry winning. So a tool of your own called `search_artifact` is left alone when you did not also list `SearchArtifactTool`, because nothing asked for that name. List both and the runtime's tool is added last and silently wins. A request that reaches a model no runtime bound it for raises `UnboundRuntimeToolError` instead of answering something wrong.

This changes what an existing agent is offered. An agent that was relying on `outline_artifact`, `search_artifact`, `query_artifact`, `slice_artifact` or `list_artifacts` has to list them now; nothing else moves, and `read_artifact` keeps working untouched.

The prefix is also what compaction scales against. `ContextBudget.projectedTokens` is the reported input tokens times the ratio of what is about to be sent to what was sent last, and the prefix sits in both halves of it, so a larger constant prefix pulls the ratio towards 1 and compaction fires later. The six tools on every agent had moved a conversation calibrated at two percent of the window from compacting to never compacting. Five of them leaving the prefix moves it back, and `.knowledge/context-projection.md` now says why, since it is the opposite of what the arithmetic looks like it should do.
