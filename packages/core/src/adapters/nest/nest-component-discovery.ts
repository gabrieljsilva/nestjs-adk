import { AgentDefinition } from "../../domain/agent/agent-definition";
import { AgentDelegationPolicy } from "../../domain/agent/agent-delegation-policy";
import { AgentDescription } from "../../domain/agent/agent-description";
import { AgentExecutionPolicies } from "../../domain/agent/agent-execution-policies";
import type { AgentFailoverPolicy } from "../../domain/agent/agent-failover-policy";
import { AgentName } from "../../domain/agent/agent-name";
import { AgentTransferPolicy } from "../../domain/agent/agent-transfer-policy";
import { DeclaredAgent } from "../../domain/agent/declared-agent";
import type { AdkCompactionPolicy } from "../../domain/context/adk-compaction-policy";
import type { LlmModel } from "../../domain/model/llm-model";
import type { PromptBuilder } from "../../domain/prompt/prompt-builder";
import type { PromptInstructions } from "../../domain/prompt/prompt-instructions";
import type { RunLimits } from "../../domain/session/run-limits";
import type { SkillDefinition } from "../../domain/skill/skill-definition";
import type { ToolDefinition } from "../../domain/tool/tool-definition";
import { AgentMetadata } from "./agent-metadata";
import { DelegationMetadata } from "./delegation-metadata";
import { TransferMetadata } from "./transfer-metadata";

/** What the adapter needs from each provider NestJS already instantiated. */
export interface DiscoveredProvider {
	readonly providerName: string;
	readonly metadata: unknown;
	readonly model: LlmModel | undefined;
	readonly instructions?: PromptInstructions;
	/** Set for an agent that builds its prompt per run, which is the alternative to `instructions`. */
	readonly promptBuilder?: PromptBuilder;
	readonly failover?: AgentFailoverPolicy;
	/** Absent leaves the agent on the module's policy, which may itself be absent. */
	readonly compaction?: AdkCompactionPolicy;
	/** Absent leaves the agent on the module's ceiling, which may itself be absent. */
	readonly limits?: RunLimits;
	/** The `@TransfersTo` payload, still unvalidated: reflect metadata is `unknown` by definition. */
	readonly transfers?: unknown;
	/** The `@DelegatesTo` payload, unvalidated for the same reason. */
	readonly delegations?: unknown;
	/** Already built: turning a decorated class into a tool belongs to whoever holds the container. */
	readonly tools?: readonly ToolDefinition[];
	readonly skills?: readonly SkillDefinition[];
}

/**
 * Turns providers NestJS already built into agent definitions.
 *
 * NestJS constructs every component the consumer declared, dependencies included;
 * this only reads what was declared and validates it. Nothing here resolves from a
 * container at run time.
 */
export class NestComponentDiscovery {
	public discover(providers: readonly DiscoveredProvider[]): DeclaredAgent[] {
		return providers.map((provider) => this.toAgent(provider));
	}

	private toAgent(provider: DiscoveredProvider): DeclaredAgent {
		const metadata = AgentMetadata.from(provider.metadata, provider.providerName);
		const name = AgentName.from(metadata.name);
		const definition = AgentDefinition.of(
			name,
			AgentDescription.from(metadata.description, name.value),
			provider.model,
			provider.instructions,
			AgentExecutionPolicies.of(
				provider.failover,
				provider.compaction,
				provider.limits,
				this.transferOf(provider),
				this.delegationOf(provider),
			),
			provider.tools ?? [],
			provider.skills ?? [],
			provider.promptBuilder,
		);
		return new DeclaredAgent(definition, provider.providerName);
	}

	private transferOf(provider: DiscoveredProvider): AgentTransferPolicy {
		const declared = TransferMetadata.from(provider.transfers, provider.providerName);
		return AgentTransferPolicy.to(declared.targets.map((target) => AgentName.from(target)));
	}

	private delegationOf(provider: DiscoveredProvider): AgentDelegationPolicy {
		const declared = DelegationMetadata.from(provider.delegations, provider.providerName);
		return AgentDelegationPolicy.to(declared.targets.map((target) => AgentName.from(target)));
	}
}
