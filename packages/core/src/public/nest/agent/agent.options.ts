import type { AgentFailoverPolicy } from "../../../domain/agent/agent-failover.policy";
import type { ModelRetryPolicy } from "../../../domain/agent/model-retry.policy";
import type { AdkCompactionPolicy } from "../../../domain/context/adk-compaction.policy";
import type { LlmModel } from "../../../domain/model/llm-model.contract";
import type { RunLimits } from "../../../domain/session/run/run-limits.value-object";

/**
 * What `@Agent` declares. The name is how anything reaches this agent and the description is
 * what another agent reads when deciding to hand it work; everything else has a default.
 *
 * `compaction`, `limits` and `retry` replace the module's for this agent, and `false` refuses
 * compaction or retry outright. `outputSchema` is declared here and never per call, because a
 * transfer, a delegation and the turn after an approval build their own scope.
 */
export interface AgentOptions {
	name: string;
	description: string;
	prompt?: string;
	tools?: readonly unknown[];
	model?: LlmModel;
	failover?: readonly LlmModel[] | AgentFailoverPolicy;
	retry?: ModelRetryPolicy | false;
	compaction?: AdkCompactionPolicy | false;
	limits?: RunLimits;
	outputSchema?: object;
}
