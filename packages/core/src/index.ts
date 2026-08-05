// abstracts (contratos)
export { AdkAgent } from "./lib/abstracts/adk-agent";
export type { AgentStream, ApproveParams, RejectParams } from "./lib/abstracts/adk-agent";
export { AdkEngine } from "./lib/abstracts/adk-engine";
export { AdkModel, isAdkModel } from "./lib/abstracts/adk-model";
export { AdkSkill } from "./lib/abstracts/adk-skill";
export { AdkTool } from "./lib/abstracts/adk-tool";
export { AdkWorkflow } from "./lib/abstracts/adk-workflow";
export { AdkEmbedder } from "./lib/abstracts/adk-embedder";
export type {
	EmbedderOptions,
	EmbeddingOutput,
	EmbeddingResult,
	EmbeddingUsage,
} from "./lib/abstracts/adk-embedder";
export { ArtifactStore } from "./lib/abstracts/artifact-store";
export { AdkToolSource } from "./lib/abstracts/adk-tool-source";
export type { ToolSourceContext } from "./lib/abstracts/adk-tool-source";
export { Similarity } from "./lib/embeddings/similarity";
export { MemoryStore } from "./lib/abstracts/memory-store";
export { type SessionReadOptions, SessionStore } from "./lib/abstracts/session-store";

// stores in-memory (defaults)
export { InMemoryArtifactStore } from "./lib/stores/in-memory-artifact-store";
export { InMemorySessionStore } from "./lib/stores/in-memory-session-store";

// pricing
export { PricingSource } from "./lib/abstracts/pricing-source";
export { PricingStorage } from "./lib/abstracts/pricing-storage";
export { LiteLLMPricingSource } from "./lib/pricing/litellm-pricing-source";
export type { LiteLLMPricingSourceOptions } from "./lib/pricing/litellm-pricing-source";
export { projectLiteLlmCatalog } from "./lib/pricing/litellm-projection";
export {
	PRICING_CURRENCY,
	applyOverride,
	embeddingCost,
	llmCost,
	resolveModelPrice,
} from "./lib/pricing/cost-calculator";
export type {
	CallCost,
	CostBreakdown,
	LlmCost,
	ModelCost,
	ModelPrice,
	PriceBand,
	PriceOverride,
	PriceRates,
	PricingCatalog,
	RunCost,
} from "./lib/pricing/pricing-types";
export { InMemoryPricingStorage } from "./lib/stores/in-memory-pricing-storage";
export { FileSystemPricingStorage } from "./lib/stores/file-system-pricing-storage";
export type { FileSystemPricingStorageOptions } from "./lib/stores/file-system-pricing-storage";
export { RedisPricingStorage } from "./lib/stores/redis-pricing-storage";
export type { RedisLikeClient, RedisPricingStorageOptions } from "./lib/stores/redis-pricing-storage";

// context diagnostics
export { ContextCollector } from "./lib/diagnostics/context-collector";
export { comparePrefix } from "./lib/diagnostics/prefix-compare";
export { cacheHitRatio } from "./lib/diagnostics/cache-ratio";
export type {
	CacheReport,
	ContextSegment,
	ContextSegmentKind,
	ContextSnapshot,
	PrefixDivergence,
	PrefixReport,
} from "./lib/diagnostics/context-types";

// sessions
export { AgentSessions } from "./lib/sessions/agent-sessions";
export type { AppendSliceInput } from "./lib/sessions/agent-sessions";

// decorators
export { Agent } from "./lib/decorators/agent.decorator";
export { DelegatesTo } from "./lib/decorators/delegates-to.decorator";
export { Embedder } from "./lib/decorators/embedder.decorator";
export { Skill } from "./lib/decorators/skill.decorator";
export { Tool } from "./lib/decorators/tool.decorator";
export { TransfersTo } from "./lib/decorators/transfers-to.decorator";
export { WorkflowAgent } from "./lib/decorators/workflow-agent.decorator";

// prompts
export { AdkPrompt } from "./lib/prompts/adk-prompt";
export type { PromptContext } from "./lib/prompts/adk-prompt";
export { PromptFiles } from "./lib/prompts/prompt-files";

// module
export { ADK_OPTIONS } from "./lib/constants";
export { AdkModule } from "./lib/module/adk.module";
export type { AdkModuleAsyncOptions, AdkModuleOptions } from "./lib/module/adk-options";

// runner
export { AgentRunner } from "./lib/runner/agent-runner";
export { RunLogger } from "./lib/runner/run-logger";
export type { LoggingOption } from "./lib/runner/run-logger";
export { DeltaStateBag } from "./lib/runner/state-bag";
export type { StateGuard } from "./lib/runner/state-bag";
export { buildInstruction, skillContent } from "./lib/runner/instruction-builder";

// model specs
export { failoverPolicy, Gemini, OpenAiLike, isModelSpec, modelIdOf } from "./lib/models/model-specs";
export { createModelSpec } from "./lib/models/create-model-spec";
export type { TypedModelSpec } from "./lib/models/create-model-spec";
export { DEFAULT_OFFLOAD_THRESHOLD, contextPolicy } from "./lib/models/context-policy";
export type { CompactionPolicy, ContextPolicy } from "./lib/models/context-policy";
export type {
	FailoverFn,
	FailoverMeta,
	FailoverOption,
	FailoverTarget,
	GeminiGenerationOptions,
	GeminiOptions,
	ModelSpec,
	OpenAiLikeOptions,
} from "./lib/models/model-specs";

// model I/O (contrato neutro do AdkModel)
export { GENERATION_KEYS } from "./lib/types/model-io";
export type {
	GenerateOptions,
	GenerationParams,
	ModelGenerationConfig,
	ModelMessage,
	ModelPart,
	ModelRequest,
	ModelResponse,
	ModelUsage,
	ToolDeclaration,
} from "./lib/types/model-io";

// multimodal tool results (attachments the model looks at, instead of JSON it reads)
export { artifactEncoding, isTextMimeType, normalizeMimeType, TEXT_MIME_TYPES } from "./lib/types/artifact-encoding";
export { isToolContent, toolContent } from "./lib/types/tool-content";
export type { ToolContent, ToolContentPart } from "./lib/types/tool-content";

// testing (embryo, migrates to @nestjs-adk/testing in F5)
export { ScriptedEngine, callTool, deltas, fail, text } from "./lib/testing/scripted-engine";
export type { ScriptTurn } from "./lib/testing/scripted-engine";
export { ScriptedModel, isScriptedModel } from "./lib/testing/scripted-model";

// registry
export { AgentDefinition } from "./lib/registry/agent-definition";
export type { SkillBinding, ToolBinding } from "./lib/registry/agent-definition";
export { AgentRef } from "./lib/registry/agent-ref";
export { AgentRegistry } from "./lib/registry/agent-registry";

// errors
export {
	AdkBootError,
	AdkError,
	DuplicateAgentNameError,
	ConflictingPromptError,
	InvalidModelError,
	InvalidWorkflowError,
	MissingModelError,
	NestedFailoverError,
	ReservedMethodError,
	UnregisteredModelError,
	UnregisteredPromptError,
	UnregisteredSkillError,
	SubAgentsRemovedError,
	UnregisteredToolError,
	UnresolvedToolsetError,
	UnsupportedModelScopeError,
} from "./lib/errors";
export {
	AgentMaxIterationsError,
	AgentNotFoundError,
	AgentStateInvalidError,
	AgentStateMissingError,
	AiEmptyResponseError,
	ApprovalNotFoundError,
	DuplicateToolSourceError,
	EmbedderNotConfiguredError,
	McpBlockedTargetError,
	McpConnectionError,
	ModelsExhaustedError,
	OutputValidationError,
	SessionNotFoundError,
	SkillNotFoundError,
	ToolExecutionError,
	ToolInvalidArgsError,
	ToolRepeatedFailureError,
	ToolSourceAuthError,
	ToolSourceUnavailableError,
} from "./lib/errors/runtime.errors";

// events & run types
export type {
	AgentEvent,
	ArtifactPart,
	ArtifactRef,
	PendingApproval,
	RawRef,
	ReauthRequest,
	RunInput,
	RunResult,
	Session,
	SessionEvent,
	SessionInit,
	TokenUsage,
} from "./lib/types/events";

// types
export type {
	AgentOptions,
	AnyZodObject,
	ApprovalPolicy,
	ModelInput,
	SkillMode,
	SkillOptions,
	ToolEffect,
	ToolOptions,
	WorkflowMode,
	WorkflowOptions,
} from "./lib/types/options";
export type { StateBag, ToolContext } from "./lib/types/tool-context";
export type { ResolvedAgent, ResolvedTool } from "./lib/types/resolved-agent";
export { isJsonSchema, pruneByProperties } from "./lib/types/json-schema";
export type { JsonSchema, ToolSchema } from "./lib/types/json-schema";
export { ToolsetResolver, isToolsetRef, toolset } from "./lib/types/toolset";
export type { ToolsetRef } from "./lib/types/toolset";
