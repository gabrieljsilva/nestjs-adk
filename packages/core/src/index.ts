/**
 * Entry point of the native runtime, published as `@nestjs-adk/core/native`.
 *
 * It exists because the provider packages need the new layers before the old barrel
 * can be taken down: `index.ts` still exports the legacy runtime, and names like
 * `ModelMessage` and `ModelRequest` exist on both sides with different meanings. When
 * the Google ADK is cut, this file becomes `index.ts` and the subpath goes away.
 */

// errors
export { AdkError } from "./common/errors/adk.error";

// identity
export { ToolCallId } from "./common/identity/tool-call-id";

// model contract
export { LlmModel } from "./domain/model/llm-model";
export { ModelSpec } from "./domain/model/model-spec";
export { createModelSpec } from "./domain/model/create-model-spec";
export type { TypedModelSpec } from "./domain/model/create-model-spec";
export { ModelDescriptor } from "./domain/model/model-descriptor";
export { ModelIdentity } from "./domain/model/model-identity";
export { ModelCapabilities } from "./domain/model/model-capabilities";
export { ModelCapability } from "./domain/model/model-capability";
export { ContextWindow } from "./domain/model/context-window";
export { ModelContextWindow } from "./domain/model/model-context-window";
export { UnknownContextWindow } from "./domain/model/unknown-context-window";

// model input and output
export { ModelRequest } from "./domain/model/model-request";
export { ModelMessage } from "./domain/model/model-message";
export type { ModelMessageRole } from "./domain/model/model-message";
export { UserMessage } from "./domain/model/user-message";
export { MediaPart } from "./domain/model/media-part";
export { AttachmentReference } from "./domain/model/attachment-reference";
export { MediaLimits } from "./domain/model/media-limits";
export { ProjectedMediaCost } from "./domain/model/projected-media-cost";
export { AssistantMessage } from "./domain/model/assistant-message";
export { ToolCallMessage } from "./domain/model/tool-call-message";
export { ToolResultMessage } from "./domain/model/tool-result-message";
export { ToolDeclaration } from "./domain/model/tool-declaration";
export { ModelChunk } from "./domain/model/model-chunk";
export { ModelUsage } from "./domain/model/model-usage";
export { ToolCallDelta } from "./domain/model/tool-call-delta";
export { ToolCall } from "./domain/model/tool-call";
export { ModelResponse } from "./domain/model/model-response";
export { TokenCount } from "./domain/model/token-count";
export { PromptInstructions } from "./domain/prompt/prompt-instructions";

// session and run
export { SessionId } from "./common/identity/session-id";
export { AgentRunId } from "./common/identity/agent-run-id";
export { AgentName } from "./domain/agent/agent-name";
export { AgentDescription } from "./domain/agent/agent-description";
export { AgentDefinition } from "./domain/agent/agent-definition";
export { AgentExecutionPolicies } from "./domain/agent/agent-execution-policies";
export { AgentTransferPolicy } from "./domain/agent/agent-transfer-policy";
export { DeclaredAgent } from "./domain/agent/declared-agent";
export { AskInput } from "./domain/session/ask-input";
export { AgentResult } from "./domain/session/agent-result";
export { AgentRunStatus } from "./domain/session/agent-run-status";
export { RunLimits } from "./domain/session/run-limits";
export { InvalidRunLimitError } from "./domain/session/errors/invalid-run-limit.error";
export { SessionMode } from "./domain/session/session-mode";
export { SessionOwner } from "./domain/session/session-owner";
export { PromptMeasurement } from "./domain/model/prompt-measurement";
export { SessionStorage } from "./contracts/session-storage";
// Everything named in the SessionStorage contract, without which nobody can implement one.
export { SessionRevision } from "./common/revision/session-revision";
export { Session } from "./domain/session/session";
export { SessionSnapshot } from "./domain/session/session-snapshot";
export { StoredSessionEvent } from "./domain/event/stored-session-event";
export { ContextCheckpoint } from "./domain/context/context-checkpoint";
export { AppendEventsCommand } from "./contracts/append-events-command";
export { AppendEventsResult } from "./contracts/append-events-result";
export { StorageCapabilities } from "./contracts/storage-capabilities";
export { ModelResolver } from "./contracts/model-resolver";
export { InMemorySessionStorage } from "./adapters/storage/in-memory-session-storage";
export { SqliteSessionStorage } from "./adapters/storage/sqlite/sqlite-session-storage";
export { SqliteConnection } from "./adapters/storage/sqlite/sqlite-connection";
export { SessionStateCodec } from "./domain/session/session-state-codec";
export { AgentRunner } from "./runtime/run/agent-runner";
export { AgentRunCommand } from "./runtime/run/agent-run-command";
export { AdkRuntimeHost } from "./public/adk-runtime-host";
export type { StartedRuntime } from "./public/adk-runtime-host";
export { HostNotStartedError } from "./public/errors/host-not-started.error";
export { UnusableComponentError } from "./adapters/nest/errors/unusable-component.error";
export {
	AdkModule,
	ADK_OPTIONS,
	ADK_DEFAULT_MODEL,
	ADK_EVENT_CONSUMERS,
	ADK_RUNTIME_PATCH,
} from "./public/nest/adk-module";
export { Agent } from "./public/nest/decorators/agent.decorator";
export { Tool } from "./public/nest/decorators/tool.decorator";
export { Skill } from "./public/nest/decorators/skill.decorator";
export { TransfersTo } from "./public/nest/decorators/transfers-to.decorator";
export { DelegatesTo } from "./public/nest/decorators/delegates-to.decorator";
export type { AgentOptions } from "./public/nest/agent-options";
export type { ToolOptions, ToolDecorator, ToolClass } from "./public/nest/decorators/tool.decorator";
export type { SkillOptions } from "./public/nest/decorators/skill.decorator";
export { AdkModuleOptions } from "./public/nest/adk-module-options";
export type { AdkModuleOptionsInput, AdkModuleOptionsPatch } from "./public/nest/adk-module-options";
export { AgentMetadata } from "./public/nest/agent-metadata";
export { ToolMetadata } from "./public/nest/tool-metadata";
export { NotAnAgentClassError } from "./public/nest/errors/not-an-agent-class.error";
export { NotAToolClassError } from "./public/nest/errors/not-a-tool-class.error";
export { AgentRegistry } from "./public/nest/agent-registry";
export { AdkAgent } from "./public/nest/adk-agent";
export { AdkTool } from "./public/nest/adk-tool";
export { AgentNotBoundError } from "./public/nest/errors/agent-not-bound.error";
export { AgentHandle } from "./public/nest/agent-handle";
export type { AskOptions } from "./public/nest/agent-handle";
export { SystemClock } from "./public/nest/system-clock";
export { RandomIdGenerator } from "./public/nest/random-id-generator";
export { RuntimeOptions } from "./runtime/composition/runtime-options";
export type { RuntimeOptionsPatch } from "./runtime/composition/runtime-options";
export { RuntimeServices } from "./runtime/composition/runtime-services";
export { ShutdownOptions } from "./runtime/lifecycle/shutdown-options";
export { Clock } from "./common/time/clock";
export { Instant } from "./common/time/instant";
export { IdGenerator } from "./common/identity/id-generator";

// tools
export { ToolEffect } from "./domain/tool/tool-effect";
export { ToolSchema } from "./domain/tool/tool-schema";
export { ToolHandler } from "./domain/tool/tool-handler";
export { ToolContext } from "./domain/tool/tool-context";
export { ToolDefinition } from "./domain/tool/tool-definition";
export { ToolInvocation } from "./domain/tool/tool-invocation";
export { ToolOutcome } from "./domain/tool/tool-outcome";
export { ToolOutput } from "./domain/tool/tool-output";
export { ParsedArguments } from "./domain/tool/parsed-arguments";
export { AdkApprovalPolicy } from "./domain/tool/adk-approval-policy";
export { EffectApprovalPolicy } from "./domain/tool/effect-approval-policy";
export { ToolNotFoundError } from "./domain/tool/errors/tool-not-found.error";
export { ToolInvalidArgsError } from "./domain/tool/errors/tool-invalid-args.error";
export { ToolRepeatedFailureError } from "./domain/tool/errors/tool-repeated-failure.error";
export { ToolApprovalRequiredError } from "./domain/tool/errors/tool-approval-required.error";
export { AgentMaxIterationsError } from "./domain/session/errors/agent-max-iterations.error";
export { ToolCatalog } from "./runtime/tool/tool-catalog";
export { ToolExecutor } from "./runtime/tool/tool-executor";
export { ToolExecutionCommand } from "./runtime/tool/tool-execution-command";
export { ToolBreaker } from "./runtime/tool/tool-breaker";
export { ZodToolSchema } from "./adapters/schema/zod-tool-schema";
export { JsonSchemaToolSchema } from "./runtime/tool/json-schema-tool-schema";

// skills and sources
export { SkillMode } from "./domain/skill/skill-mode";
export { SkillDefinition } from "./domain/skill/skill-definition";
export { SkillCatalog } from "./runtime/skill/skill-catalog";
export { ActivateSkillTool } from "./runtime/skill/activate-skill-tool";
export { ToolSource } from "./contracts/tool-source";
export { ToolSourceScope } from "./runtime/tool/tool-source-scope";
export { ToolSourceAuthError } from "./domain/tool/errors/tool-source-auth.error";
export { ToolSourceUnavailableError } from "./domain/tool/errors/tool-source-unavailable.error";
export { PendingCall } from "./domain/session/pending-call";
export { ApprovalStatus } from "./domain/session/approval-status";
export { SessionInspection } from "./domain/session/session-inspection";
export { InspectSession } from "./runtime/session/inspect-session";
export { SnapshotPolicy } from "./runtime/session/snapshot/snapshot-policy";
export type { ApprovalDecision } from "./domain/session/pending-call";
export { PendingTurn } from "./domain/session/pending-turn";
export { ApproveInput } from "./domain/session/approve-input";
export { DelegateInput } from "./domain/session/delegate-input";
export { DelegateAgent } from "./runtime/run/delegate-agent";
export { RejectInput } from "./domain/session/reject-input";
export { ApprovalNotPendingError } from "./domain/session/errors/approval-not-pending.error";
export { DuplicateSkillNameError } from "./domain/skill/errors/duplicate-skill-name.error";

// diagnostics
export { ContextSegment } from "./domain/diagnostics/context-segment";
export { ContextSnapshot } from "./domain/diagnostics/context-snapshot";
export { PrefixDivergence } from "./domain/diagnostics/prefix-divergence";
export { PrefixReport } from "./domain/diagnostics/prefix-report";
export { CacheReport } from "./domain/diagnostics/cache-report";
export { ContextCapture } from "./runtime/diagnostics/context-capture";
export { CapturedContexts } from "./runtime/diagnostics/captured-contexts";
export { ContextPhotographer } from "./runtime/diagnostics/context-photographer";
export { PrefixComparator } from "./runtime/diagnostics/prefix-comparator";
export { CacheEfficiency } from "./runtime/diagnostics/cache-efficiency";
export { NotEnoughRunsError } from "./runtime/diagnostics/errors/not-enough-runs.error";
export { ExplainAgent } from "./runtime/run/explain-agent";
export { RunObservers } from "./runtime/run/run-observers";

// streaming
export { ChunkSink } from "./runtime/stream/chunk-sink";
export { ChunkStream } from "./runtime/stream/chunk-stream";
export { StreamAgent } from "./runtime/run/stream-agent";

// delegation
export { DelegateToAgentTool } from "./runtime/delegation/delegate-to-agent-tool";
export { DelegationRequest } from "./runtime/delegation/delegation-request";
export { DelegationRunner } from "./runtime/delegation/delegation-runner";
export { DelegatedTurnLoop } from "./runtime/delegation/delegated-turn-loop";
export { AgentDelegationPolicy } from "./domain/agent/agent-delegation-policy";
export { DelegationNotDeclaredError } from "./domain/agent/errors/delegation-not-declared.error";
export { AgentMaxDelegationDepthError } from "./domain/session/errors/agent-max-delegation-depth.error";
export { DelegationSuspendedError } from "./runtime/delegation/errors/delegation-suspended.error";
export { UnknownDelegationTargetError } from "./runtime/catalog/errors/unknown-delegation-target.error";

// transfer
export { TransferToAgentTool } from "./runtime/transfer/transfer-to-agent-tool";
export { TransferGate } from "./runtime/transfer/transfer-gate";
export { AgentSwitch } from "./runtime/transfer/agent-switch";
export { TransferNotDeclaredError } from "./domain/agent/errors/transfer-not-declared.error";
export { AgentMaxTransfersError } from "./domain/session/errors/agent-max-transfers.error";
export { UnknownTransferTargetError } from "./runtime/catalog/errors/unknown-transfer-target.error";

// artifacts
export { ArtifactId } from "./common/identity/artifact-id";
export { ArtifactStorage } from "./contracts/artifact-storage";
export { ArtifactContent } from "./domain/artifact/artifact-content";
export { ArtifactReference } from "./domain/artifact/artifact-reference";
export { OffloadPolicy } from "./domain/artifact/offload-policy";
export { OffloadedContent } from "./domain/artifact/offloaded-content";
export { ArtifactNotFoundError } from "./domain/artifact/errors/artifact-not-found.error";
export { TamperedArtifactReferenceError } from "./domain/artifact/errors/tampered-artifact-reference.error";
export { InMemoryArtifactStorage } from "./adapters/storage/in-memory-artifact-storage";
export { ArtifactOffloader } from "./runtime/artifact/artifact-offloader";
export { ReadArtifactTool } from "./runtime/artifact/read-artifact-tool";
export { AttachmentStore } from "./runtime/artifact/attachment-store";
export { AttachmentReader } from "./runtime/artifact/attachment-reader";

// embeddings
export { Embedder } from "./contracts/embedder";
export { EmbeddingVector } from "./domain/embedding/embedding-vector";
export { Similarity } from "./domain/embedding/similarity";
export { EmptyVectorError } from "./domain/embedding/errors/empty-vector.error";
export { IncompatibleVectorsError } from "./domain/embedding/errors/incompatible-vectors.error";

// observation
export { Secret } from "./common/secrecy/secret";
export { SessionEventConsumer } from "./contracts/session-event-consumer";
export { ConsumerNoticeSink } from "./contracts/consumer-notice-sink";
export { PublishedEvent } from "./domain/event/published-event";
export { ConsumerFailed } from "./domain/event/consumer-failed";
export { SessionEventCodecs } from "./domain/event/session-event-codecs";
export { EventPublisher } from "./runtime/event/event-publisher";
export { EventRedactor } from "./runtime/event/event-redactor";

// execution
export { ModelExecutor } from "./runtime/model/model-executor";
export { ModelRunner } from "./runtime/model/model-runner";
export { ModelRunCommand } from "./runtime/model/model-run-command";
export { ModelRunOutcome } from "./runtime/model/model-run-outcome";

// compaction
export { AdkCompactionPolicy } from "./domain/context/adk-compaction-policy";
export { TokenThresholdCompactionPolicy } from "./domain/context/token-threshold-compaction-policy";
export { CompactionDecision } from "./domain/context/compaction-decision";
export { ContextBudget } from "./domain/context/context-budget";
export { ContextBlock } from "./domain/context/context-block";
export { InvalidCompactionThresholdError } from "./domain/context/errors/invalid-compaction-threshold.error";
export { ContextSummarizer } from "./contracts/context-summarizer";
export { CompactionStrategy } from "./contracts/compaction-strategy";

// failover
export { AgentFailoverPolicy } from "./domain/agent/agent-failover-policy";
export { SequentialFailoverPolicy } from "./domain/agent/sequential-failover-policy";
export { FailoverContext } from "./domain/agent/failover-context";
export { ModelReroute } from "./domain/agent/model-reroute";
export { ModelsExhaustedError } from "./domain/agent/errors/models-exhausted.error";
export { StructuredOutputValidator } from "./contracts/structured-output-validator";
export { JsonStructuredOutputValidator } from "./runtime/model/json-structured-output-validator";
export { UnsupportedCapabilityError } from "./domain/model/errors/unsupported-capability.error";
export { UnsupportedMediaTypeError } from "./domain/model/errors/unsupported-media-type.error";
export { MalformedMediaError } from "./domain/model/errors/malformed-media.error";
export { MediaTooLargeError } from "./domain/model/errors/media-too-large.error";
export { AttachmentNotStoredError } from "./runtime/artifact/errors/attachment-not-stored.error";
export { MalformedToolCallError } from "./domain/model/errors/malformed-tool-call.error";
export { InvalidStructuredOutputError } from "./domain/model/errors/invalid-structured-output.error";
export { EmptyModelResponseError } from "./domain/model/errors/empty-model-response.error";

// model failures
export { ModelFailure } from "./domain/model/model-failure";
export { RateLimitedFailure } from "./domain/model/rate-limited-failure";
export { UnavailableFailure } from "./domain/model/unavailable-failure";
export { TimeoutFailure } from "./domain/model/timeout-failure";
export { ContextExceededFailure } from "./domain/model/context-exceeded-failure";
export { SafetyBlockedFailure } from "./domain/model/safety-blocked-failure";
export { InvalidRequestFailure } from "./domain/model/invalid-request-failure";
export { UnknownFailure } from "./domain/model/unknown-failure";
export { ModelCallFailedError } from "./domain/model/errors/model-call-failed.error";
