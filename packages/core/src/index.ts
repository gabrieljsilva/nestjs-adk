/**
 * Everything `@nestjs-adk/core` publishes, and nothing else.
 *
 * What belongs here is what an application writes against: the decorators and the module,
 * the base classes, the ports it implements, the adapters the library ships, the policies it
 * chooses between, and the values it reads off a result or hands to a call. A class the
 * runtime uses to do its work does not belong here even when it is perfectly good code, and
 * every name that leaves is a name an editor stops offering to somebody writing an agent.
 *
 * Two groups look internal and are not. The message and tool-call types are here because
 * writing a model adapter means translating them, and `ToolDefinition` is here because a
 * `ToolSource` has to build one. Those are contracts with the outside, whatever folder they
 * happen to live in.
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
export { UserMessage } from "./domain/model/user-message";
export { MediaPart } from "./domain/model/media-part";
export { MediaLimits } from "./domain/model/media-limits";
export { AssistantMessage } from "./domain/model/assistant-message";
export { ToolCallMessage } from "./domain/model/tool-call-message";
export { ToolResultMessage } from "./domain/model/tool-result-message";
export { ToolDeclaration } from "./domain/model/tool-declaration";
export { ModelChunk } from "./domain/model/model-chunk";
export { ModelUsage } from "./domain/model/model-usage";
export { ToolCallDelta } from "./domain/model/tool-call-delta";
export { ModelResponse } from "./domain/model/model-response";
export { TokenCount } from "./domain/model/token-count";
export { PromptInstructions } from "./domain/prompt/prompt-instructions";

// prompting
export { PromptTemplate } from "./domain/prompt/prompt-template";
export { PromptContext } from "./domain/prompt/prompt-context";
export { PromptBuilder } from "./domain/prompt/prompt-builder";
export { MissingPromptVariablesError } from "./domain/prompt/errors/missing-prompt-variables.error";
export { PromptNotFoundError } from "./domain/prompt/errors/prompt-not-found.error";
export { PromptSource } from "./contracts/prompt-source";
export { FileSystemPromptSource } from "./adapters/prompt/file-system-prompt-source";
export { PromptFileReader } from "./adapters/prompt/prompt-file-reader";
export { FsPromptFileReader } from "./adapters/prompt/fs-prompt-file-reader";
export { PromptFileCache } from "./adapters/prompt/prompt-file-cache";
export { PromptFileUnreadableError } from "./adapters/prompt/errors/prompt-file-unreadable.error";
export { AgentPrompting } from "./public/nest/agent-prompting";
export { MethodPromptBuilder } from "./public/nest/method-prompt-builder";
export { AgentPromptScan } from "./public/nest/agent-prompt-scan";
export { AmbiguousAgentPromptError } from "./public/nest/errors/ambiguous-agent-prompt.error";
export { ConflictingPromptOptionsError } from "./public/nest/errors/conflicting-prompt-options.error";

// session and run
export { SessionId } from "./common/identity/session-id";
export { AgentRunId } from "./common/identity/agent-run-id";
export { AgentName } from "./domain/agent/agent-name";
export { AgentDescription } from "./domain/agent/agent-description";
export { AgentDefinition } from "./domain/agent/agent-definition";
export { AgentResult } from "./domain/session/agent-result";
export { AgentRunStatus } from "./domain/session/agent-run-status";
export { RunLimits } from "./domain/session/run-limits";
export { InvalidRunLimitError } from "./domain/session/errors/invalid-run-limit.error";
export { SessionMode } from "./domain/session/session-mode";
export { SessionOwner } from "./domain/session/session-owner";
export { SessionStorage } from "./contracts/session-storage";
// Everything named in the SessionStorage contract, without which nobody can implement one.
export { SessionRevision } from "./common/revision/session-revision";
export { StorageCapabilities } from "./contracts/storage-capabilities";
export { ModelResolver } from "./contracts/model-resolver";
export { InMemorySessionStorage } from "./adapters/storage/in-memory-session-storage";
export { SqliteSessionStorage } from "./adapters/storage/sqlite/sqlite-session-storage";
export { SqliteConnection } from "./adapters/storage/sqlite/sqlite-connection";

/**
 * What a session storage written outside this package moves between a row and the domain.
 *
 * They belong next to the port for the same reason `PromptFileCache` belongs next to
 * `PromptSource`: implementing a port is something an application does, and the pieces it
 * needs to do it are public API. Without them the only storages that can exist are the two
 * above, because an event fabricated by hand fails every check in the projectors without
 * matching one, and a conversation comes back empty rather than failing.
 */
export { StorageCodecs } from "./adapters/storage/codec/storage-codecs";
export { JournalCodec } from "./adapters/storage/codec/journal-codec";
export { SnapshotCodec } from "./adapters/storage/codec/snapshot-codec";
export { SessionHeadCodec } from "./adapters/storage/codec/session-head-codec";
export { CheckpointCodec } from "./adapters/storage/codec/checkpoint-codec";
export { ModelMessageCodec } from "./adapters/storage/codec/model-message-codec";
export { JournalRecord } from "./adapters/storage/codec/journal-record";
export { SnapshotRecord } from "./adapters/storage/codec/snapshot-record";
export { SessionHeadRecord } from "./adapters/storage/codec/session-head-record";
export { CheckpointRecord } from "./adapters/storage/codec/checkpoint-record";
export { StoredRow } from "./adapters/storage/codec/stored-row";
export { SessionNotFoundError } from "./domain/session/errors/session-not-found.error";
export { SessionAlreadyExistsError } from "./domain/session/errors/session-already-exists.error";
export { SessionRevisionConflictError } from "./domain/session/errors/session-revision-conflict.error";
export { JournalCorruptedError } from "./domain/session/errors/journal-corrupted.error";
export { UnreadableStoredValueError } from "./adapters/storage/codec/errors/unreadable-stored-value.error";
export { InvalidStoredRowError } from "./adapters/storage/codec/errors/invalid-stored-row.error";
export type { SessionEvent } from "./domain/event/session-event";
export { SessionEventBatch } from "./domain/event/session-event-batch";
export type { SessionEventRegistry } from "./domain/event/session-event-registry";
export { SessionEventCodecs } from "./domain/event/session-event-codecs";

/**
 * A port contract as data: cases a suite yields and any runner drives.
 *
 * The suites themselves live where their subject does. `SessionStorageContractSuite` is in
 * `@nestjs-adk/testing`, because measuring an adapter is testing and belongs with the test
 * bed, and because `node:assert` has no business in the entry point every application loads.
 */
export { ContractSuite } from "./support/contract/contract-suite";
export { ContractCase } from "./support/contract/contract-case";
export { AgentRunCommand } from "./runtime/run/agent-run-command";
export { AdkRuntimeHost } from "./public/adk-runtime-host";
export type { StartedRuntime } from "./public/adk-runtime-host";
export { HostNotStartedError } from "./public/errors/host-not-started.error";
export { UnusableComponentError } from "./adapters/nest/errors/unusable-component.error";
export { UnregisteredToolError } from "./adapters/nest/errors/unregistered-tool.error";
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
export type {
	AdkModuleOptionsInput,
	AdkModuleOptionsPatch,
	PromptFileOptions,
} from "./public/nest/adk-module-options";
export { AgentMetadata } from "./public/nest/agent-metadata";
export { ToolMetadata } from "./public/nest/tool-metadata";
export type { AgentClass, AgentTarget } from "./public/nest/agent-target";
export { NotAnAgentClassError } from "./public/nest/errors/not-an-agent-class.error";
export { NotAToolClassError } from "./public/nest/errors/not-a-tool-class.error";
export { AgentRegistry } from "./public/nest/agent-registry";
export { AdkAgent } from "./public/nest/adk-agent";
export { AdkTool } from "./public/nest/adk-tool";
export { AgentNotBoundError } from "./public/nest/errors/agent-not-bound.error";
export { AgentHandle } from "./public/nest/agent-handle";
export type { AskOptions, DecisionOptions } from "./public/nest/agent-handle";
export { SystemClock } from "./common/time/system-clock";
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
export { ToolOutput } from "./domain/tool/tool-output";
export { AdkApprovalPolicy } from "./domain/tool/adk-approval-policy";
export { EffectApprovalPolicy } from "./domain/tool/effect-approval-policy";
export { ToolNotFoundError } from "./domain/tool/errors/tool-not-found.error";
export { ToolInvalidArgsError } from "./domain/tool/errors/tool-invalid-args.error";
export { ToolRepeatedFailureError } from "./domain/tool/errors/tool-repeated-failure.error";
export { ToolApprovalRequiredError } from "./domain/tool/errors/tool-approval-required.error";
export { AgentMaxIterationsError } from "./domain/session/errors/agent-max-iterations.error";
export { ZodToolSchema } from "./adapters/schema/zod-tool-schema";
export { JsonSchemaToolSchema } from "./runtime/tool/json-schema-tool-schema";

// skills and sources
export { SkillMode } from "./domain/skill/skill-mode";
export { ToolSource } from "./contracts/tool-source";
export { ToolSourceAuthError } from "./domain/tool/errors/tool-source-auth.error";
export { ToolSourceUnavailableError } from "./domain/tool/errors/tool-source-unavailable.error";
export { PendingCall } from "./domain/session/pending-call";
export { SessionInspection } from "./domain/session/session-inspection";
export { SnapshotPolicy } from "./runtime/session/snapshot/snapshot-policy";
export { ApprovalNotPendingError } from "./domain/session/errors/approval-not-pending.error";
export { DuplicateSkillNameError } from "./domain/skill/errors/duplicate-skill-name.error";

// diagnostics
export { ContextSegment } from "./domain/diagnostics/context-segment";
export { ContextSnapshot } from "./domain/diagnostics/context-snapshot";
export { PrefixComparator } from "./runtime/diagnostics/prefix-comparator";
export { NotEnoughRunsError } from "./runtime/diagnostics/errors/not-enough-runs.error";
export { RunObservers } from "./runtime/run/run-observers";

// streaming
export { ChunkSink } from "./runtime/stream/chunk-sink";

// delegation
export { DelegationNotDeclaredError } from "./domain/agent/errors/delegation-not-declared.error";
export { AgentMaxDelegationDepthError } from "./domain/session/errors/agent-max-delegation-depth.error";
export { DelegationSuspendedError } from "./runtime/delegation/errors/delegation-suspended.error";
export { UnknownDelegationTargetError } from "./runtime/catalog/errors/unknown-delegation-target.error";

// transfer
export { TransferNotDeclaredError } from "./domain/agent/errors/transfer-not-declared.error";
export { AgentMaxTransfersError } from "./domain/session/errors/agent-max-transfers.error";
export { UnknownTransferTargetError } from "./runtime/catalog/errors/unknown-transfer-target.error";

// artifacts
export { ArtifactStorage } from "./contracts/artifact-storage";
export { OffloadPolicy } from "./domain/artifact/offload-policy";
export { ArtifactNotFoundError } from "./domain/artifact/errors/artifact-not-found.error";
export { TamperedArtifactReferenceError } from "./domain/artifact/errors/tampered-artifact-reference.error";
export { InMemoryArtifactStorage } from "./adapters/storage/in-memory-artifact-storage";

// embeddings
export { Embedder } from "./contracts/embedder";
export { MeteredEmbedder } from "./contracts/metered-embedder";
export { PricedEmbedder } from "./runtime/cost/priced-embedder";
export { UndeclaredEmbedder } from "./public/nest/undeclared-embedder";
export { EmbedderNotDeclaredError } from "./public/nest/errors/embedder-not-declared.error";
export { EmbeddingVector } from "./domain/embedding/embedding-vector";
export { Similarity } from "./domain/embedding/similarity";
export { EmptyVectorError } from "./domain/embedding/errors/empty-vector.error";
export { IncompatibleVectorsError } from "./domain/embedding/errors/incompatible-vectors.error";

// observation
export { Secret } from "./common/secrecy/secret";
export { SessionEventConsumer } from "./contracts/session-event-consumer";
export { ConsumerNoticeSink } from "./contracts/consumer-notice-sink";
export { PublishedEvent } from "./domain/event/published-event";

// execution
export { ModelExecutor } from "./runtime/model/model-executor";

// compaction
export { AdkCompactionPolicy } from "./domain/context/adk-compaction-policy";
export { TokenThresholdCompactionPolicy } from "./domain/context/token-threshold-compaction-policy";
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

// cost
export { UsdAmount } from "./domain/cost/usd-amount";
export { TokenRate } from "./domain/cost/token-rate";
export { ModelPrice } from "./domain/cost/model-price";
export { CostBreakdown } from "./domain/cost/cost-breakdown";
export { ModelCost } from "./domain/cost/model-cost";
export { RunCost } from "./domain/cost/run-cost";
export { ModelUnpriced } from "./domain/cost/model-unpriced";
export type { UnpricedReason } from "./domain/cost/model-unpriced";
export { NegativeAmountError } from "./domain/cost/errors/negative-amount.error";
export { PricingSource } from "./contracts/pricing-source";
export { PricingNoticeSink } from "./contracts/pricing-notice-sink";
export { CatalogTransport } from "./adapters/pricing/catalog-transport";
export { HttpCatalogTransport } from "./adapters/pricing/http-catalog-transport";
export { LiteLlmCatalogProjection } from "./adapters/pricing/lite-llm-catalog-projection";
export { LiteLLMPricingSource } from "./adapters/pricing/lite-llm-pricing-source";
export type { LiteLlmPricingOptions } from "./adapters/pricing/lite-llm-pricing-source";
export { MalformedCatalogError } from "./adapters/pricing/errors/malformed-catalog.error";
export { CatalogUnreachableError } from "./adapters/pricing/errors/catalog-unreachable.error";

// Named in the signature of a port an application implements, so a port cannot be
// implemented without them. They are contracts even though they look like internals.
export { AppendEventsCommand } from "./contracts/append-events-command";
export { AppendEventsResult } from "./contracts/append-events-result";
export { Session } from "./domain/session/session";
export { SessionSnapshot } from "./domain/session/session-snapshot";
export { StoredSessionEvent } from "./domain/event/stored-session-event";
export { ContextCheckpoint } from "./domain/context/context-checkpoint";
export { ArtifactContent } from "./domain/artifact/artifact-content";
export { ArtifactReference } from "./domain/artifact/artifact-reference";
export { ArtifactId } from "./common/identity/artifact-id";
export { ToolInvocation } from "./domain/tool/tool-invocation";
export { ParsedArguments } from "./domain/tool/parsed-arguments";
export { CompactionDecision } from "./domain/context/compaction-decision";
export { ContextBudget } from "./domain/context/context-budget";
export { ContextProjection } from "./domain/context/context-projection";
export { ConsumerFailed } from "./domain/event/consumer-failed";
export { ContextNoticeSink } from "./contracts/context-notice-sink";
export { ContextWindowUnknown } from "./domain/context/context-window-unknown";
export { MeteredEmbedding } from "./domain/embedding/metered-embedding";
export { PriceBand } from "./domain/cost/price-band";
