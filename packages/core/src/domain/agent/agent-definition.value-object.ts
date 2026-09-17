import type { AdkCompactionPolicy } from "../context/adk-compaction.policy";
import type { LlmModel } from "../model/llm-model.contract";
import type { PromptBuilder } from "../prompt/prompt-builder.contract";
import type { PromptInstructions } from "../prompt/prompt-instructions.value-object";
import type { RunLimits } from "../session/run/run-limits.value-object";
import type { SkillDefinition } from "../skill/skill-definition.value-object";
import type { ToolDefinition } from "../tool/tool-definition.value-object";
import type { AgentDelegationPolicy } from "./agent-delegation.policy";
import type { AgentDescription } from "./agent-description.value-object";
import { AgentExecutionPolicies } from "./agent-execution-policies.value-object";
import type { AgentFailoverPolicy } from "./agent-failover.policy";
import type { AgentName } from "./agent-name.value-object";
import type { AgentTransferPolicy } from "./agent-transfer.policy";
import { MissingAgentModelError } from "./errors/missing-agent-model.error";
import type { ModelRetryPolicy } from "./model-retry.policy";

/** Everything one agent is, named rather than ordered. */
export interface AgentDefinitionInput {
	name: AgentName;
	description: AgentDescription;
	model: LlmModel | undefined;
	instructions?: PromptInstructions;
	policies?: AgentExecutionPolicies;
	tools?: readonly ToolDefinition[];
	skills?: readonly SkillDefinition[];
	promptBuilder?: PromptBuilder;
	outputSchema?: object;
}

/**
 * The resolved shape of one agent: name, description and exactly one primary model. Everything
 * else is an optional capability or a rule about how it runs, and a definition never holds state
 * produced by a run.
 */
export class AgentDefinition {
	public readonly name: AgentName;
	public readonly description: AgentDescription;
	public readonly model: LlmModel;
	public readonly instructions?: PromptInstructions;
	public readonly policies: AgentExecutionPolicies;
	public readonly tools: readonly ToolDefinition[];
	public readonly skills: readonly SkillDefinition[];
	public readonly promptBuilder?: PromptBuilder;
	public readonly outputSchema?: object;

	public constructor(input: AgentDefinitionInput) {
		if (input.model === undefined) throw new MissingAgentModelError(input.name.value);
		this.name = input.name;
		this.description = input.description;
		this.model = input.model;
		this.instructions = input.instructions;
		this.policies = input.policies ?? AgentExecutionPolicies.none();
		this.tools = [...(input.tools ?? [])];
		this.skills = [...(input.skills ?? [])];
		this.promptBuilder = input.promptBuilder;
		this.outputSchema = input.outputSchema;
	}

	public get failover(): AgentFailoverPolicy | undefined {
		return this.policies.failover;
	}

	public get retry(): ModelRetryPolicy | undefined {
		return this.policies.retry;
	}

	public get compaction(): AdkCompactionPolicy | false | undefined {
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

	public get wantsStructuredOutput(): boolean {
		return this.outputSchema !== undefined;
	}

	public get hasInstructions(): boolean {
		return this.instructions !== undefined;
	}

	public get hasFailover(): boolean {
		return this.failover !== undefined;
	}

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
