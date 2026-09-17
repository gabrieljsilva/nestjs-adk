import type { AgentRunId } from "../../common/identity/agent-run-id.value-object";
import type { AgentFailoverPolicy } from "../../domain/agent/agent-failover.policy";
import type { AgentName } from "../../domain/agent/agent-name.value-object";
import type { ModelRetryPolicy } from "../../domain/agent/model-retry.policy";
import type { LlmModel } from "../../domain/model/llm-model.contract";
import type { ModelRequest } from "../../domain/model/model-request.value-object";
import type { RunContext } from "../../domain/run/run-context.value-object";

export interface ModelRunInput {
	context: RunContext;
	runId: AgentRunId;
	agent: AgentName;
	model: LlmModel;
	request: ModelRequest;
	retry?: ModelRetryPolicy;
	failover?: AgentFailoverPolicy;
	signal?: AbortSignal;
}

export class ModelRunCommand {
	public readonly context: RunContext;
	public readonly runId: AgentRunId;
	public readonly agent: AgentName;
	public readonly model: LlmModel;
	public readonly request: ModelRequest;
	public readonly retry?: ModelRetryPolicy;
	public readonly failover?: AgentFailoverPolicy;
	public readonly signal?: AbortSignal;

	public constructor(input: ModelRunInput) {
		this.context = input.context;
		this.runId = input.runId;
		this.agent = input.agent;
		this.model = input.model;
		this.request = input.request;
		this.retry = input.retry;
		this.failover = input.failover;
		this.signal = input.signal;
	}
}
