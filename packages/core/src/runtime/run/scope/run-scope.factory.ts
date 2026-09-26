import type { AgentDefinition } from "../../../domain/agent/agent-definition.value-object";
import type { AdkCompactionPolicy } from "../../../domain/context/adk-compaction.policy";
import { WindowShareCompactionPolicy } from "../../../domain/context/window-share-compaction.policy";
import type { LlmModel } from "../../../domain/model/llm-model.contract";
import { PromptContext } from "../../../domain/prompt/prompt-context.value-object";
import type { PromptInstructions } from "../../../domain/prompt/prompt-instructions.value-object";
import type { RunContext } from "../../../domain/run/run-context.value-object";
import { RunLimits } from "../../../domain/session/run/run-limits.value-object";
import type { ToolDefinition } from "../../../domain/tool/tool-definition.value-object";
import { DelegateToAgentTool } from "../../delegation/delegate-to-agent.tool";
import { ActivateSkillTool } from "../../skill/activate-skill.tool";
import { SkillCatalog } from "../../skill/skill-catalog.service";
import { RuntimeTools } from "../../tool/runtime-tools.value-object";
import { ToolBreaker } from "../../tool/tool-breaker.service";
import { ToolCatalog } from "../../tool/tool-catalog.service";
import { TransferToAgentTool } from "../../transfer/transfer-to-agent.tool";
import type { StartedRun } from "../settle/started-run.value-object";
import { RunScope } from "./run-scope.value-object";

export class RunScopeFactory {
	private readonly standardCompaction = new WindowShareCompactionPolicy();

	public constructor(
		private readonly runtimeTools: RuntimeTools = RuntimeTools.none(),
		private readonly limits: RunLimits = RunLimits.unbounded(),
		private readonly compaction?: AdkCompactionPolicy | false,
	) {}

	public async create(
		context: RunContext,
		definition: AgentDefinition,
		model: LlmModel,
		started: StartedRun,
		remote: readonly ToolDefinition[] = [],
		callLimits?: RunLimits,
	): Promise<RunScope> {
		const skills = new SkillCatalog(definition.skills);
		const limits = this.limits.overriddenBy(definition.limits).overriddenBy(callLimits);
		return new RunScope(
			context,
			definition,
			model,
			started,
			this.buildCatalog(definition, remote, skills),
			skills,
			limits,
			new ToolBreaker(limits),
			remote,
			this.resolveCompaction(definition),
			await this.buildPrompt(context, definition),
		);
	}

	public async switched(scope: RunScope, definition: AgentDefinition, model: LlmModel): Promise<RunScope> {
		const skills = new SkillCatalog(definition.skills);
		const context = scope.context.withActiveAgent(definition.name);
		return new RunScope(
			context,
			definition,
			model,
			scope.started,
			this.buildCatalog(definition, scope.remote, skills),
			skills,
			scope.limits,
			scope.breaker,
			scope.remote,
			this.resolveCompaction(definition),
			await this.buildPrompt(context, definition),
		);
	}

	public async delegated(
		parent: RunScope,
		child: StartedRun,
		definition: AgentDefinition,
		model: LlmModel,
	): Promise<RunScope> {
		const skills = new SkillCatalog(definition.skills);
		const limits = this.limits.overriddenBy(definition.limits);
		const context = parent.context.delegatedTo(child.run, child.cancellation.signal);
		return new RunScope(
			context,
			definition,
			model,
			child,
			this.buildCatalog(definition, parent.remote, skills),
			skills,
			limits,
			new ToolBreaker(limits),
			parent.remote,
			this.resolveCompaction(definition),
			await this.buildPrompt(context, definition),
		);
	}

	private resolveCompaction(definition: AgentDefinition): AdkCompactionPolicy | undefined {
		const declared = definition.compaction ?? this.compaction;
		if (declared === false) return undefined;
		return declared ?? this.standardCompaction;
	}

	private async buildPrompt(context: RunContext, definition: AgentDefinition): Promise<PromptInstructions | undefined> {
		const builder = definition.promptBuilder;
		if (builder === undefined) return undefined;
		return await builder.build(
			new PromptContext(
				context.sessionId,
				context.runId,
				definition.name,
				context.metadata,
				context.signal,
				context.actor,
			),
		);
	}

	private buildCatalog(
		definition: AgentDefinition,
		remote: readonly ToolDefinition[],
		skills: SkillCatalog,
	): ToolCatalog {
		const declared = [
			...definition.tools,
			...remote,
			...(skills.hasOnDemand ? [ActivateSkillTool.forCatalog(skills)] : []),
			...(definition.transfersToAnyone ? [TransferToAgentTool.forPolicy(definition.transfer)] : []),
			...(definition.delegatesToAnyone ? [DelegateToAgentTool.forPolicy(definition.delegation)] : []),
		];
		return new ToolCatalog(declared.length === 0 ? [] : [...declared, ...this.runtimeTools.bind(declared)]);
	}
}
