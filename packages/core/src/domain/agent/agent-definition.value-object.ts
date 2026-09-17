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
	public readonly model: LlmModel;
	public readonly tools: readonly ToolDefinition[];
	public readonly skills: readonly SkillDefinition[];

	public constructor(
		public readonly name: AgentName,
		public readonly description: AgentDescription,
		model: LlmModel | undefined,
		public readonly instructions?: PromptInstructions,
		public readonly policies: AgentExecutionPolicies = AgentExecutionPolicies.none(),
		tools: readonly ToolDefinition[] = [],
		skills: readonly SkillDefinition[] = [],
		/**
		 * Builds the prompt once per run, for an agent whose instruction depends on data.
		 *
		 * It is the alternative to `instructions` and never a second one alongside it: an agent
		 * that declared both is refused where the two declarations are read, so anything holding
		 * a definition can treat a builder as the whole answer.
		 */
		public readonly promptBuilder?: PromptBuilder,
		/**
		 * The shape this agent answers in, as a JSON schema the provider is told to enforce.
		 *
		 * It lives here and not on a call because it is what the agent *is*, not how one run
		 * behaves: an agent that answers data answers data to a transfer, to a delegation and to
		 * the turn that follows an approval, and each of those builds its scope without the
		 * command that started the run. A per-call schema would be silently absent in exactly
		 * those three places.
		 */
		public readonly outputSchema?: object,
	) {
		if (model === undefined) throw new MissingAgentModelError(name.value);
		this.model = model;
		this.tools = [...tools];
		this.skills = [...skills];
	}

	public get failover(): AgentFailoverPolicy | undefined {
		return this.policies.failover;
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

	/** Whether this agent answers data rather than prose, which the model has to support. */
	public get wantsStructuredOutput(): boolean {
		return this.outputSchema !== undefined;
	}

	/** Absence of a prompt is a valid composition, never a default text. */
	public get hasInstructions(): boolean {
		return this.instructions !== undefined;
	}

	public get hasFailover(): boolean {
		return this.failover !== undefined;
	}

	/** Whether this agent said anything about compaction, including that it wants none. */
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
