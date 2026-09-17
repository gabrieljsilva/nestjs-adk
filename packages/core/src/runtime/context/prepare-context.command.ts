import type { AgentRunId } from "../../common/identity/agent-run-id.value-object";
import type { SessionId } from "../../common/identity/session-id.value-object";
import type { AdkCompactionPolicy } from "../../domain/context/adk-compaction.policy";
import type { LlmModel } from "../../domain/model/llm-model.contract";
import type { ToolDeclaration } from "../../domain/model/messages/tool-declaration.value-object";
import type { PromptMeasurement } from "../../domain/model/usage/prompt-measurement.value-object";
import type { PromptInstructions } from "../../domain/prompt/prompt-instructions.value-object";
import type { RunContext } from "../../domain/run/run-context.value-object";

export interface PrepareContextParams {
	context: RunContext;
	model: LlmModel;
	tools?: readonly ToolDeclaration[];
	runtimeInstructions?: PromptInstructions;
	agentPrompt?: PromptInstructions;
	compaction?: AdkCompactionPolicy;
	lastPrompt?: PromptMeasurement;
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

	public get runId(): AgentRunId {
		return this.context.runId;
	}
}
