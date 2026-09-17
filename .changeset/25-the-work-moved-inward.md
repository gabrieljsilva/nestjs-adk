---
"@nestjs-adk/core": major
---

The work moved inward, and the surface got smaller.

A use case is now a sequence of awaits on services. What it used to do itself moved to the module that owns it: `ModelService` answers which model runs a command and refuses an attachment the model cannot read; `ToolService` opens a run's tool sources and closes them however the run ends; `SessionOpener` answers with the conversation *and* the agent that owns it now; `NestScanService` is the one door onto reading a finished NestJS container.

`ConsumerNoticeSink` is now **`ConsumerFailureSink`**, which is what it reports. Rename the import; nothing else about it changed.

The three sinks are one family. `ContextNoticeSink`, `ConsumerFailureSink` and `PricingNoticeSink` now extend the exported `NoticeSink<T>`, so a sink written against one reads like a sink written against any of them. Existing implementations keep working: each sink is still its own abstract class with the same `report`.

`ExplainAgentUseCase.attempt` is gone. `execute` was always the public path; a run that fails now fails to the caller instead of answering with half its snapshots.

`AdkAgent` no longer copies `AgentHandle` method by method: it *is* a handle, bound by the module after NestJS has built it. `this.support.ask(...)` is unchanged, and a verb added to the handle reaches an injected agent class without being copied. It also answers `name`, as a handle does.

`@wirely/core` is no longer a dependency. The composition it held resolved nothing: every provider was a value the composition had already built.
