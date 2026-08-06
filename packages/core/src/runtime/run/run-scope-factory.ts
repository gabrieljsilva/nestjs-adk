import type { AgentDefinition } from "../../domain/agent/agent-definition";
import type { AdkCompactionPolicy } from "../../domain/context/adk-compaction-policy";
import type { LlmModel } from "../../domain/model/llm-model";
import { RunLimits } from "../../domain/session/run-limits";
import type { ToolDefinition } from "../../domain/tool/tool-definition";
import { DelegateToAgentTool } from "../delegation/delegate-to-agent-tool";
import { ActivateSkillTool } from "../skill/activate-skill-tool";
import { SkillCatalog } from "../skill/skill-catalog";
import { ToolBreaker } from "../tool/tool-breaker";
import { ToolCatalog } from "../tool/tool-catalog";
import { TransferToAgentTool } from "../transfer/transfer-to-agent-tool";
import { RunScope } from "./run-scope";
import type { StartedRun } from "./started-run";

/**
 * Resolves what a run is allowed to do, from three levels that each narrow the one above.
 *
 * It owns the things the runtime decides rather than the agent: the tools offered on the
 * runtime's own behalf, the widest limits any run may have, and what to do about a context
 * that grew. The agent narrows the limits and the call narrows them again, and a level
 * that declared nothing leaves the level above exactly as it was.
 *
 * Compaction resolves the same way with one difference: it replaces rather than narrows.
 * An agent that declared a policy runs under its own, and one that declared none runs
 * under the module's, because two policies deciding how much to keep would be one of them
 * shortening what the other just decided to hold on to.
 */
export class RunScopeFactory {
	public constructor(
		private readonly runtimeTools: readonly ToolDefinition[] = [],
		private readonly limits: RunLimits = RunLimits.none(),
		private readonly compaction?: AdkCompactionPolicy,
	) {}

	public create(
		definition: AgentDefinition,
		model: LlmModel,
		started: StartedRun,
		remote: readonly ToolDefinition[] = [],
		callLimits?: RunLimits,
	): RunScope {
		const skills = SkillCatalog.of(definition.skills);
		const limits = this.limits.overriddenBy(definition.limits).overriddenBy(callLimits);
		return new RunScope(
			definition,
			model,
			started,
			this.catalogOf(definition, remote, skills),
			skills,
			limits,
			new ToolBreaker(limits),
			remote,
			this.compactionFor(definition),
		);
	}

	/**
	 * The same run, now answered by somebody else.
	 *
	 * Tools, skills and instructions come from the agent that received the session, and
	 * everything the run already spent stays: the limits were resolved for this run and a
	 * handover must not widen them, and the breaker keeps counting the failures it has seen.
	 * What the remote sources opened belongs to the run rather than to an agent, so it
	 * travels across untouched.
	 */
	public switched(scope: RunScope, definition: AgentDefinition, model: LlmModel): RunScope {
		const skills = SkillCatalog.of(definition.skills);
		return new RunScope(
			definition,
			model,
			scope.started,
			this.catalogOf(definition, scope.remote, skills),
			skills,
			scope.limits,
			scope.breaker,
			scope.remote,
			this.compactionFor(definition),
		);
	}

	/**
	 * The child run of a delegation, with its own everything except the session it writes to.
	 *
	 * Limits are resolved from scratch for the child agent rather than inherited: a delegation
	 * is a separate piece of work with a separate budget, and the parent's remaining iterations
	 * say nothing about how many the child needs. The breaker is new for the same reason, and
	 * the run's remote tools travel across because a source belongs to the run.
	 */
	public delegated(parent: RunScope, child: StartedRun, definition: AgentDefinition, model: LlmModel): RunScope {
		const skills = SkillCatalog.of(definition.skills);
		const limits = this.limits.overriddenBy(definition.limits);
		return new RunScope(
			definition,
			model,
			child,
			this.catalogOf(definition, parent.remote, skills),
			skills,
			limits,
			new ToolBreaker(limits),
			parent.remote,
			this.compactionFor(definition),
		);
	}

	/** The agent's own policy, or the module's, and never both narrowing each other. */
	private compactionFor(definition: AgentDefinition): AdkCompactionPolicy | undefined {
		return definition.compaction ?? this.compaction;
	}

	/**
	 * What the agent declared, what its sources opened, and what the runtime offers alongside.
	 *
	 * An agent with nothing to call gets nothing at all, not even the runtime's own tools.
	 * There is no artifact to read back where no tool ever produced a result, and declaring
	 * one would ask a model without the tools capability to answer for a tool.
	 */
	private catalogOf(definition: AgentDefinition, remote: readonly ToolDefinition[], skills: SkillCatalog): ToolCatalog {
		const declared = [
			...definition.tools,
			...remote,
			...(skills.hasOnDemand ? [ActivateSkillTool.forCatalog(skills)] : []),
			...(definition.transfersToAnyone ? [TransferToAgentTool.forPolicy(definition.transfer)] : []),
			...(definition.delegatesToAnyone ? [DelegateToAgentTool.forPolicy(definition.delegation)] : []),
		];
		return ToolCatalog.of(declared.length === 0 ? [] : [...declared, ...this.runtimeTools]);
	}
}
