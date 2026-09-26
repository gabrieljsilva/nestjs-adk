---
"@nestjs-adk/core": major
---

A tool name the runtime owns is refused at boot, instead of being taken back on every run.

The runtime appends its own tools to a catalog after whatever the agent declared, and a catalog keys tools by name with the last entry winning. So an agent that declared a tool of its own called `read_artifact` never had it. The model was offered the runtime's tool under that name, the handler the application wrote was never called, and nothing said so anywhere: no error, no notice, no line to grep for. Losing a tool this way is worse than failing, because the run still finishes and answers with something nobody wrote.

`AgentCatalogBuilder.add` now refuses it. An agent that declares a tool of its own under a name the runtime owns raises `DuplicateRuntimeToolNameError`, code `CATALOG_DUPLICATE_RUNTIME_TOOL_NAME`, carrying the tool name, the agent name and the provider that declared it. Both entry points walk through that builder, so `AdkModule` and `createAdkRuntime` refuse the same declaration in the same way, at boot, once, at the place the mistake was written.

The reserved set is every name the runtime binds, and not only the tools an agent asked for:

```text
read_artifact, list_artifacts, outline_artifact, search_artifact, query_artifact, slice_artifact, edit_artifact,
activate_skill, transfer_to_agent, delegate_to_agent
```

Reserving only what an agent listed would protect the wrong half. An application that lists `SearchArtifactTool` and then writes a `search_artifact` of its own has at least read that the name is taken. The names nobody lists are the dangerous ones: `read_artifact` is handed to every agent that has tools at all, and the runtime adds `activate_skill`, `transfer_to_agent` and `delegate_to_agent` to the catalog by itself. Those four are exactly the names an application collides with by accident, because it never wrote them down.

The set reads each name off the class that declares it, so a tool that renames itself cannot leave a stale literal behind in the guard. Asking for a runtime tool is unchanged: `SearchArtifactTool.request()` answers a `RuntimeToolRequest`, and a request that shares the name of the tool it stands for is the opt-in mechanism working, so the check skips it.

The last three reach a catalog only when the agent has an on-demand skill, a transfer edge or a delegation edge, and they are reserved unconditionally all the same. Reserving them only where the edge exists would mean an application's own `transfer_to_agent` works, for months, until somebody adds one transfer target to that agent. The boot would then break on a tool file nobody touched, for a reason with no visible link to the edit that caused it. Failing always is easier to act on than failing later.

**Breaking:** an application that declared a tool of its own under one of those ten names booted before and does not now. The message names the provider and the tool. To get the runtime's tool, list the class; to keep yours, rename it.
