import { AgentDefinition } from "../../../domain/agent/agent-definition.value-object";
import { AgentDelegationPolicy } from "../../../domain/agent/agent-delegation.policy";
import { AgentDescription } from "../../../domain/agent/agent-description.value-object";
import { AgentExecutionPolicies } from "../../../domain/agent/agent-execution-policies.value-object";
import type { AgentFailoverPolicy } from "../../../domain/agent/agent-failover.policy";
import { AgentName } from "../../../domain/agent/agent-name.value-object";
import { AgentTransferPolicy } from "../../../domain/agent/agent-transfer.policy";
import { DeclaredAgent } from "../../../domain/agent/declared-agent.value-object";
import type { ModelRetryPolicy } from "../../../domain/agent/model-retry.policy";
import type { AdkCompactionPolicy } from "../../../domain/context/adk-compaction.policy";
import type { LlmModel } from "../../../domain/model/llm-model.contract";
import type { PromptBuilder } from "../../../domain/prompt/prompt-builder.contract";
import type { PromptInstructions } from "../../../domain/prompt/prompt-instructions.value-object";
import type { RunLimits } from "../../../domain/session/run/run-limits.value-object";
import type { SkillDefinition } from "../../../domain/skill/skill-definition.value-object";
import type { ToolDefinition } from "../../../domain/tool/tool-definition.value-object";
import { AgentMetadata } from "../metadata/agent-metadata.value-object";
import { DelegationMetadata } from "../metadata/delegation-metadata.value-object";
import { TransferMetadata } from "../metadata/transfer-metadata.value-object";

export interface DiscoveredProvider {
	readonly providerName: string;
	readonly metadata: unknown;
	readonly model: LlmModel | undefined;
	readonly instructions?: PromptInstructions;
	readonly promptBuilder?: PromptBuilder;
	readonly failover?: AgentFailoverPolicy;
	readonly retry?: ModelRetryPolicy;
	readonly compaction?: AdkCompactionPolicy | false;
	readonly limits?: RunLimits;
	readonly transfers?: unknown;
	readonly delegations?: unknown;
	readonly tools?: readonly ToolDefinition[];
	readonly skills?: readonly SkillDefinition[];
	readonly outputSchema?: object;
}

export class NestComponentDiscovery {
	public discover(providers: readonly DiscoveredProvider[]): DeclaredAgent[] {
		return providers.map((provider) => this.toAgent(provider));
	}

	private toAgent(provider: DiscoveredProvider): DeclaredAgent {
		const metadata = AgentMetadata.from(provider.metadata, provider.providerName);
		const name = AgentName.from(metadata.name);
		const definition = new AgentDefinition({
			name: name,
			description: AgentDescription.from(metadata.description, name.value),
			model: provider.model,
			instructions: provider.instructions,
			policies: new AgentExecutionPolicies(
				provider.failover,
				provider.compaction,
				provider.limits,
				this.readTransferPolicy(provider),
				this.readDelegationPolicy(provider),
				provider.retry,
			),
			tools: provider.tools ?? [],
			skills: provider.skills ?? [],
			promptBuilder: provider.promptBuilder,
			outputSchema: provider.outputSchema,
		});
		return new DeclaredAgent(definition, provider.providerName);
	}

	private readTransferPolicy(provider: DiscoveredProvider): AgentTransferPolicy {
		const declared = TransferMetadata.from(provider.transfers, provider.providerName);
		return AgentTransferPolicy.to(declared.targets.map((target) => AgentName.from(target)));
	}

	private readDelegationPolicy(provider: DiscoveredProvider): AgentDelegationPolicy {
		const declared = DelegationMetadata.from(provider.delegations, provider.providerName);
		return AgentDelegationPolicy.to(declared.targets.map((target) => AgentName.from(target)));
	}
}
