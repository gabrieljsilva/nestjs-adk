import type { AgentRunId } from "../../common/identity/agent-run-id.value-object";
import type { AgentFailoverPolicy } from "../../domain/agent/agent-failover.policy";
import type { AgentName } from "../../domain/agent/agent-name.value-object";
import type { ModelRetryPolicy } from "../../domain/agent/model-retry.policy";
import type { LlmModel } from "../../domain/model/llm-model.contract";
import type { ModelRequest } from "../../domain/model/model-request.value-object";
import type { RunContext } from "../../domain/run/run-context.value-object";

/** One turn to run, named rather than ordered. */
export interface ModelRunInput {
	/** Where this turn is happening, so a validator reads the same facts every other port reads. */
	context: RunContext;
	runId: AgentRunId;
	agent: AgentName;
	model: LlmModel;
	request: ModelRequest;
	/** Asked first, and only about the model that just failed. Absent leaves the runtime's own. */
	retry?: ModelRetryPolicy;
	failover?: AgentFailoverPolicy;
	signal?: AbortSignal;
}

/**
 * One turn to run, with the model to start from, how many times it is worth asking that
 * model again, and the policy to fall back through once it is not.
 *
 * Without a failover policy there is no failover at all: the first failure the retries did
 * not absorb is the answer, which is the right default for an agent that never declared
 * what to do instead.
 */
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
