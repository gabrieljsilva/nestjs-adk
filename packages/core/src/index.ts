// abstracts (contratos)
export { AdkAgent } from "./lib/abstracts/adk-agent";
export { AdkEngine } from "./lib/abstracts/adk-engine";
export { AdkSkill } from "./lib/abstracts/adk-skill";
export { AdkTool } from "./lib/abstracts/adk-tool";
export { AdkWorkflow } from "./lib/abstracts/adk-workflow";
export { ArtifactStore } from "./lib/abstracts/artifact-store";
export { Embedder } from "./lib/abstracts/embedder";
export type { EmbeddingResult, EmbeddingUsage } from "./lib/abstracts/embedder";
export { Similarity } from "./lib/embeddings/similarity";
export { MemoryStore } from "./lib/abstracts/memory-store";
export { SessionStore } from "./lib/abstracts/session-store";

// stores in-memory (defaults)
export { InMemoryArtifactStore } from "./lib/stores/in-memory-artifact-store";
export { InMemorySessionStore } from "./lib/stores/in-memory-session-store";

// sessions
export { AgentSessions } from "./lib/sessions/agent-sessions";
export type { AppendSliceInput } from "./lib/sessions/agent-sessions";

// decorators
export { Agent } from "./lib/decorators/agent.decorator";
export { Skill } from "./lib/decorators/skill.decorator";
export { Tool } from "./lib/decorators/tool.decorator";
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
export { Gemini, ModelRouter, OpenAiLike, isModelSpec } from "./lib/models/model-specs";
export { DEFAULT_OFFLOAD_THRESHOLD, contextPolicy } from "./lib/models/context-policy";
export type { CompactionPolicy, ContextPolicy } from "./lib/models/context-policy";
export type {
	GeminiOptions,
	ModelSpec,
	OpenAiLikeOptions,
	RouterTarget,
} from "./lib/models/model-specs";

// testing (embryo — migrates to @nestjs-adk/testing in F5)
export { ScriptedEngine, callTool, fail, text } from "./lib/testing/scripted-engine";
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
	InvalidWorkflowError,
	MissingModelError,
	ReservedMethodError,
	UnregisteredPromptError,
	UnregisteredSkillError,
	UnregisteredSubAgentError,
	UnregisteredToolError,
	UnresolvedToolsetError,
} from "./lib/errors";
export {
	AgentMaxIterationsError,
	AgentNotFoundError,
	AgentStateInvalidError,
	AgentStateMissingError,
	AiEmptyResponseError,
	ApprovalNotFoundError,
	EmbedderNotConfiguredError,
	McpConnectionError,
	ModelsExhaustedError,
	OutputValidationError,
	SessionNotFoundError,
	SkillNotFoundError,
	ToolExecutionError,
	ToolRepeatedFailureError,
} from "./lib/errors/runtime.errors";

// events & run types
export type {
	AgentEvent,
	ArtifactPart,
	ArtifactRef,
	PendingApproval,
	RawRef,
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
	ModelInput,
	SkillMode,
	SkillOptions,
	ToolOptions,
	WorkflowMode,
	WorkflowOptions,
} from "./lib/types/options";
export type { StateBag, ToolContext } from "./lib/types/tool-context";
export type { ResolvedAgent, ResolvedTool } from "./lib/types/resolved-agent";
export { ToolsetResolver, isToolsetRef, toolset } from "./lib/types/toolset";
export type { ToolsetRef } from "./lib/types/toolset";
