import type { AdkCompactionPolicy } from "../context/adk-compaction.policy";
import type { RunLimits } from "../session/run/run-limits.value-object";
import { AgentDelegationPolicy } from "./agent-delegation.policy";
import type { AgentFailoverPolicy } from "./agent-failover.policy";
import { AgentTransferPolicy } from "./agent-transfer.policy";
import type { ModelRetryPolicy } from "./model-retry.policy";

/**
 * The rules an agent runs under, as one thing instead of four constructor slots.
 *
 * They are grouped because they are read together and grow together: every capability the
 * runtime gains arrives as another rule about how a run behaves, and adding each one to a
 * positional constructor is how a definition ends up with ten parameters nobody can order
 * correctly. What an agent *is* stays on the definition; how it *runs* is here.
 *
 * Every rule is absent by default, and absent means whatever the runtime decided is safe:
 * no failover, no limit, no agent to transfer or delegate to, and the standard share of the
 * window for compaction. Compaction is the one that can also be declared as `false`, which
 * is a decision to never shorten a conversation and not the same thing as declaring nothing.
 */
export class AgentExecutionPolicies {
	public constructor(
		public readonly failover?: AgentFailoverPolicy,
		public readonly compaction?: AdkCompactionPolicy | false,
		public readonly limits?: RunLimits,
		public readonly transfer: AgentTransferPolicy = AgentTransferPolicy.none(),
		public readonly delegation: AgentDelegationPolicy = AgentDelegationPolicy.none(),
		/**
		 * Whether a failed call is tried again on the same model, before failover is consulted.
		 * Absent leaves the agent on the runtime's policy; `NoRetryPolicy` is how it refuses one.
		 */
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
