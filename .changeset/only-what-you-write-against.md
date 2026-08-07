---
"@nestjs-adk/core": major
---

The barrel now publishes what you write against, and nothing else: 79 internal classes are no longer exported.

`@nestjs-adk/core` exported 292 names. Most of them were the runtime doing its work: the class that executes a tool, the one that counts failures, the one that publishes events, the commands they pass each other. None of it was documented, none of it was usable on its own, and all of it was in the way. An editor offered `ToolBreaker`, `DelegatedTurnLoop` and `EventRedactor` to somebody who was trying to write an agent.

What is published now is the surface an application actually touches: the decorators and the module, `AdkAgent` and `AdkTool`, the ports you implement, the adapters the library ships, the policies you choose between, and the values you read off a result or hand to a call. 213 names, all of them documented in the README.

Two groups that look internal stayed, because they are contracts with the outside rather than plumbing: the message and tool-call types (`ModelMessage`, `ToolCallMessage`, `ToolResultMessage`, `ToolCallDelta`, `ToolDeclaration`), since writing a model adapter means translating them, and `ToolDefinition`, since a `ToolSource` has to build one.

Removed, grouped by what they were:

- run and turn internals: `AgentRunner`, `AgentSwitch`, `ChunkStream`, `DelegateAgent`, `DelegatedTurnLoop`, `DelegationRequest`, `DelegationRunner`, `ExplainAgent`, `InspectSession`, `ModelRunCommand`, `ModelRunOutcome`, `ModelRunner`, `StreamAgent`, `TransferGate`
- tool internals: `ActivateSkillTool`, `DelegateToAgentTool`, `ParsedArguments`, `ReadArtifactTool`, `SkillCatalog`, `SkillDefinition`, `ToolBreaker`, `ToolCatalog`, `ToolExecutionCommand`, `ToolExecutor`, `ToolInvocation`, `ToolOutcome`, `ToolSourceScope`, `TransferToAgentTool`
- session and event internals: `AppendEventsCommand`, `AppendEventsResult`, `ApprovalDecision`, `ApprovalStatus`, `ApproveInput`, `AskInput`, `ConsumerFailed`, `DelegateInput`, `EventPublisher`, `EventRedactor`, `PendingTurn`, `RejectInput`, `Session`, `SessionEventCodecs`, `SessionSnapshot`, `SessionStateCodec`, `StoredSessionEvent`
- agent composition internals: `AgentDelegationPolicy`, `AgentExecutionPolicies`, `AgentTransferPolicy`, `DeclaredAgent`
- context and artifact internals: `ArtifactContent`, `ArtifactId`, `ArtifactOffloader`, `ArtifactReference`, `AttachmentReader`, `AttachmentReference`, `AttachmentStore`, `CacheEfficiency`, `CacheReport`, `CapturedContexts`, `CompactionDecision`, `ContextBudget`, `ContextCapture`, `ContextCheckpoint`, `ContextPhotographer`, `ModelMessageRole`, `OffloadedContent`, `PrefixDivergence`, `PrefixReport`, `ProjectedMediaCost`, `PromptMeasurement`, `ToolCall`
- cost internals: `AppliedRates`, `BilledCall`, `CallCost`, `CostCalculator`, `MeteredEmbedding`, `PriceBand`, `PricedEmbedding`, `RunCostReporter`

If you were importing one of these, say what for: either it belongs on the public surface and the export comes back with documentation, or the thing you were doing needs a seam that does not exist yet.
