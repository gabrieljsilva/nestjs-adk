import type { AdkCompactionPolicy } from "../context/adk-compaction-policy";
import type { LlmModel } from "../model/llm-model";
import type { PromptInstructions } from "../prompt/prompt-instructions";
import type { RunLimits } from "../session/run-limits";
import type { SkillDefinition } from "../skill/skill-definition";
import type { ToolDefinition } from "../tool/tool-definition";
import type { AgentDelegationPolicy } from "./agent-delegation-policy";
import type { AgentDescription } from "./agent-description";
import { AgentExecutionPolicies } from "./agent-execution-policies";
import type { AgentFailoverPolicy } from "./agent-failover-policy";
import type { AgentName } from "./agent-name";
import type { AgentTransferPolicy } from "./agent-transfer-policy";
import { MissingAgentModelError } from "./errors/missing-agent-model.error";

/**
 * The resolved shape of one agent: name, description and exactly one primary model.
 * Everything else is an optional capability or a rule about how it runs, and the
 * definition never holds state produced by a run.
 *
 * The rules travel as `AgentExecutionPolicies` so that a new one costs a field there
 * rather than a parameter here, and are read through getters so nobody has to know
 * which of the two objects a rule happens to live on.
 */
export class AgentDefinition {
	private constructor(
		public readonly name: AgentName,
		public readonly description: AgentDescription,
		public readonly model: LlmModel,
		public readonly instructions: PromptInstructions | undefined,
		public readonly policies: AgentExecutionPolicies,
		public readonly tools: readonly ToolDefinition[] = [],
		public readonly skills: readonly SkillDefinition[] = [],
	) {}

	public static of(
		name: AgentName,
		description: AgentDescription,
		model: LlmModel | undefined,
		instructions?: PromptInstructions,
		policies: AgentExecutionPolicies = AgentExecutionPolicies.none(),
		tools: readonly ToolDefinition[] = [],
		skills: readonly SkillDefinition[] = [],
	): AgentDefinition {
		if (model === undefined) throw new MissingAgentModelError(name.value);
		return new AgentDefinition(name, description, model, instructions, policies, [...tools], [...skills]);
	}

	public get failover(): AgentFailoverPolicy | undefined {
		return this.policies.failover;
	}

	public get compaction(): AdkCompactionPolicy | undefined {
		return this.policies.compaction;
	}

	public get limits(): RunLimits | undefined {
		return this.policies.limits;
	}

	public get transfer(): AgentTransferPolicy {
		return this.policies.transfer;
	}

	public get delegation(): AgentDelegationPolicy {
		return this.policies.delegation;
	}

	/** Absence of a prompt is a valid composition, never a default text. */
	public get hasInstructions(): boolean {
		return this.instructions !== undefined;
	}

	public get hasFailover(): boolean {
		return this.failover !== undefined;
	}

	/** Without a policy nothing is ever compacted, which is the safe default for someone's conversation. */
	public get hasCompaction(): boolean {
		return this.compaction !== undefined;
	}

	public get transfersToAnyone(): boolean {
		return !this.transfer.isEmpty;
	}

	public get delegatesToAnyone(): boolean {
		return !this.delegation.isEmpty;
	}
}
