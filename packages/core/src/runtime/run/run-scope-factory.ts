import type { AgentDefinition } from "../../domain/agent/agent-definition";
import type { AdkCompactionPolicy } from "../../domain/context/adk-compaction-policy";
import type { LlmModel } from "../../domain/model/llm-model";
import { PromptContext } from "../../domain/prompt/prompt-context";
import type { PromptInstructions } from "../../domain/prompt/prompt-instructions";
import { RunLimits } from "../../domain/session/run-limits";
import type { SessionOwner } from "../../domain/session/session-owner";
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
 * Resolves what a run is allowed to do, from three levels that each replace the one above.
 *
 * It owns the things the runtime decides rather than the agent: the tools offered on the
 * runtime's own behalf, the limits a run defaults to, and what to do about a context that
 * grew. The agent replaces the limits field by field and the call replaces them again, and
 * a field nobody declared keeps whatever the level above it decided.
 *
 * Replacing is not capping. An agent that declares more iterations than the module gets
 * them, because a sector that genuinely runs longer is the reason the field exists: capping
 * would leave the application raising the module's limit for every agent instead.
 *
 * Compaction resolves the same way, and there it is the whole policy that is replaced
 * rather than a field: an agent that declared one runs under its own, and one that declared
 * none runs under the module's, because two policies deciding how much to keep would be one
 * of them shortening what the other just decided to hold on to.
 *
 * This is also where an agent's own `prompt()` is called, which is why every method here
 * answers a promise. A scope is born exactly three times in a run's life, and each one is a
 * different agent taking over, so resolving the prompt here means once per agent per run:
 * the loop reads what was already decided instead of rebuilding the head of the model's
 * prefix on every turn.
 */
export class RunScopeFactory {
	public constructor(
		private readonly runtimeTools: readonly ToolDefinition[] = [],
		private readonly limits: RunLimits = RunLimits.none(),
		private readonly compaction?: AdkCompactionPolicy,
	) {}

	public async create(
		definition: AgentDefinition,
		model: LlmModel,
		started: StartedRun,
		remote: readonly ToolDefinition[] = [],
		callLimits?: RunLimits,
		owner?: SessionOwner,
	): Promise<RunScope> {
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
			owner,
			await this.promptFor(definition, started, owner),
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
	public async switched(scope: RunScope, definition: AgentDefinition, model: LlmModel): Promise<RunScope> {
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
			scope.owner,
			await this.promptFor(definition, scope.started, scope.owner),
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
	public async delegated(
		parent: RunScope,
		child: StartedRun,
		definition: AgentDefinition,
		model: LlmModel,
	): Promise<RunScope> {
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
			parent.owner,
			await this.promptFor(definition, child, parent.owner),
		);
	}

	/** The agent's own policy, or the module's, and never both narrowing each other. */
	private compactionFor(definition: AgentDefinition): AdkCompactionPolicy | undefined {
		return definition.compaction ?? this.compaction;
	}

	/**
	 * What the agent built for this run, and nothing at all when it builds nothing.
	 *
	 * An agent with no builder is the common case and costs no call: the scope falls back to
	 * the text the decorator declared. Whatever the builder throws travels out of here, which
	 * ends the run before the model is asked anything, because an agent whose instruction
	 * could not be assembled is not an agent that should answer.
	 */
	private async promptFor(
		definition: AgentDefinition,
		started: StartedRun,
		owner?: SessionOwner,
	): Promise<PromptInstructions | undefined> {
		const builder = definition.promptBuilder;
		if (builder === undefined) return undefined;
		return await builder.build(
			new PromptContext(started.run.sessionId, started.run.id, definition.name, owner, started.cancellation.signal),
		);
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
