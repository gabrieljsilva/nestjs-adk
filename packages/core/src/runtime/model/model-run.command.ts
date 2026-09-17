import type { AgentRunId } from "../../common/identity/agent-run-id.value-object";
import type { AgentFailoverPolicy } from "../../domain/agent/agent-failover.policy";
import type { AgentName } from "../../domain/agent/agent-name.value-object";
import type { LlmModel } from "../../domain/model/llm-model.contract";
import type { ModelRequest } from "../../domain/model/model-request.value-object";
import type { RunContext } from "../../domain/run/run-context.value-object";

/**
 * One turn to run, with the model to start from and the policy to fall back through.
 * Without a policy there is no failover at all: the first failure is the answer, which
 * is the right default for an agent that never declared what to do instead.
 */
export class ModelRunCommand {
	public constructor(
		/** Where this turn is happening, so a validator reads the same facts every other port reads. */
		public readonly context: RunContext,
		public readonly runId: AgentRunId,
		public readonly agent: AgentName,
		public readonly model: LlmModel,
		public readonly request: ModelRequest,
		public readonly failover?: AgentFailoverPolicy,
		public readonly signal?: AbortSignal,
	) {}
}
