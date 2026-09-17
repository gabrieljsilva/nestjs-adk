import type { AdkCompactionPolicy } from "../context/adk-compaction.policy";
import type { RunLimits } from "../session/run/run-limits.value-object";
import { AgentDelegationPolicy } from "./agent-delegation.policy";
import type { AgentFailoverPolicy } from "./agent-failover.policy";
import { AgentTransferPolicy } from "./agent-transfer.policy";
import type { ModelRetryPolicy } from "./model-retry.policy";

/**
 * The rules an agent runs under. Every rule is absent by default, and absent means whatever the
 * runtime decided. Compaction can also be declared as `false`, which is a decision to never
 * shorten a conversation and not the same thing as declaring nothing.
 */
export class AgentExecutionPolicies {
	public constructor(
		public readonly failover?: AgentFailoverPolicy,
		public readonly compaction?: AdkCompactionPolicy | false,
		public readonly limits?: RunLimits,
		public readonly transfer: AgentTransferPolicy = AgentTransferPolicy.none(),
		public readonly delegation: AgentDelegationPolicy = AgentDelegationPolicy.none(),
		public readonly retry?: ModelRetryPolicy,
	) {}

	public static none(): AgentExecutionPolicies {
		return new AgentExecutionPolicies(
			undefined,
			undefined,
			undefined,
			AgentTransferPolicy.none(),
			AgentDelegationPolicy.none(),
		);
	}

	public withTransfer(transfer: AgentTransferPolicy): AgentExecutionPolicies {
		return new AgentExecutionPolicies(this.failover, this.compaction, this.limits, transfer, this.delegation, this.retry);
	}

	public withDelegation(delegation: AgentDelegationPolicy): AgentExecutionPolicies {
		return new AgentExecutionPolicies(this.failover, this.compaction, this.limits, this.transfer, delegation, this.retry);
	}
}
