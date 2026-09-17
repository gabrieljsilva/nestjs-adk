import type { AgentRunId } from "../../common/identity/agent-run-id.value-object";
import type { SessionId } from "../../common/identity/session-id.value-object";
import type { AdkCompactionPolicy } from "../../domain/context/adk-compaction.policy";
import type { LlmModel } from "../../domain/model/llm-model.contract";
import type { ToolDeclaration } from "../../domain/model/messages/tool-declaration.value-object";
import type { PromptMeasurement } from "../../domain/model/usage/prompt-measurement.value-object";
import type { PromptInstructions } from "../../domain/prompt/prompt-instructions.value-object";
import type { RunContext } from "../../domain/run/run-context.value-object";

/**
 * Everything needed to turn a session into the next model call.
 *
 * Without a compaction policy nothing is ever compacted: shortening someone's
 * conversation is a decision, and it is taken where it was declared.
 *
 * `lastPrompt` is what the provider reported for the previous call of this session,
 * together with how large the prompt was when it was reported. It is the only source of
 * an absolute size in the whole pipeline, so without it a context has a size in
 * characters and none in tokens, and nothing is refused on guesswork.
 */
/** Everything the preparation takes, named rather than ordered. */
export interface PrepareContextParams {
	/** Where this call is being prepared, handed on to the projector and the strategy. */
	context: RunContext;
	model: LlmModel;
	tools?: readonly ToolDeclaration[];
	runtimeInstructions?: PromptInstructions;
	agentPrompt?: PromptInstructions;
	compaction?: AdkCompactionPolicy;
	lastPrompt?: PromptMeasurement;
	/** The shape the agent answers in, carried through so the projection can ask for it. */
	outputSchema?: object;
}

export class PrepareContextCommand {
	public readonly context: RunContext;
	public readonly model: LlmModel;
	public readonly tools: readonly ToolDeclaration[];
	public readonly runtimeInstructions?: PromptInstructions;
	public readonly agentPrompt?: PromptInstructions;
	public readonly compaction?: AdkCompactionPolicy;
	public readonly lastPrompt?: PromptMeasurement;
	public readonly outputSchema?: object;

	public constructor(params: PrepareContextParams) {
		this.context = params.context;
		this.model = params.model;
		this.tools = params.tools ?? [];
		this.runtimeInstructions = params.runtimeInstructions;
		this.agentPrompt = params.agentPrompt;
		this.compaction = params.compaction;
		this.lastPrompt = params.lastPrompt;
		this.outputSchema = params.outputSchema;
	}

	public get sessionId(): SessionId {
		return this.context.sessionId;
	}

	/** Which run is asking, which is what decides whether a run scoped skill is still loaded. */
	public get runId(): AgentRunId {
		return this.context.runId;
	}
}
