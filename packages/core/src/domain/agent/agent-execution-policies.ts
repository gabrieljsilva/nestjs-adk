import type { AdkCompactionPolicy } from "../context/adk-compaction-policy";
import type { RunLimits } from "../session/run-limits";
import { AgentDelegationPolicy } from "./agent-delegation-policy";
import type { AgentFailoverPolicy } from "./agent-failover-policy";
import { AgentTransferPolicy } from "./agent-transfer-policy";

/**
 * The rules an agent runs under, as one thing instead of four constructor slots.
 *
 * They are grouped because they are read together and grow together: every capability the
 * runtime gains arrives as another rule about how a run behaves, and adding each one to a
 * positional constructor is how a definition ends up with ten parameters nobody can order
 * correctly. What an agent *is* stays on the definition; how it *runs* is here.
 *
 * Every rule is absent by default, and absent means the safe thing: no failover, nothing
 * compacted, no limit, and no agent to transfer or delegate to.
 */
export class AgentExecutionPolicies {
	private constructor(
		public readonly failover: AgentFailoverPolicy | undefined,
		public readonly compaction: AdkCompactionPolicy | undefined,
		public readonly limits: RunLimits | undefined,
		public readonly transfer: AgentTransferPolicy,
		public readonly delegation: AgentDelegationPolicy,
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

	public static of(
		failover?: AgentFailoverPolicy,
		compaction?: AdkCompactionPolicy,
		limits?: RunLimits,
		transfer: AgentTransferPolicy = AgentTransferPolicy.none(),
		delegation: AgentDelegationPolicy = AgentDelegationPolicy.none(),
	): AgentExecutionPolicies {
		return new AgentExecutionPolicies(failover, compaction, limits, transfer, delegation);
	}

	public withTransfer(transfer: AgentTransferPolicy): AgentExecutionPolicies {
		return new AgentExecutionPolicies(this.failover, this.compaction, this.limits, transfer, this.delegation);
	}

	public withDelegation(delegation: AgentDelegationPolicy): AgentExecutionPolicies {
		return new AgentExecutionPolicies(this.failover, this.compaction, this.limits, this.transfer, delegation);
	}
}
