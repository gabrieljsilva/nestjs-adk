import type { SessionId } from "../../../common/identity/session-id.value-object";
import type { AgentDefinition } from "../../../domain/agent/agent-definition.value-object";
import type { AgentName } from "../../../domain/agent/agent-name.value-object";
import type { AdkCompactionPolicy } from "../../../domain/context/adk-compaction.policy";
import type { LlmModel } from "../../../domain/model/llm-model.contract";
import type { PromptInstructions } from "../../../domain/prompt/prompt-instructions.value-object";
import type { RunContext } from "../../../domain/run/run-context.value-object";
import type { SessionMetadata } from "../../../domain/session/metadata/session-metadata.value-object";
import type { AgentRun } from "../../../domain/session/run/agent-run.entity";
import type { RunLimits } from "../../../domain/session/run/run-limits.value-object";
import type { Actor } from "../../../domain/tool/access/actor.value-object";
import type { ToolDefinition } from "../../../domain/tool/tool-definition.value-object";
import type { SkillCatalog } from "../../skill/skill-catalog.service";
import type { ToolBreaker } from "../../tool/tool-breaker.service";
import type { ToolCatalog } from "../../tool/tool-catalog.service";
import type { StartedRun } from "../settle/started-run.value-object";

export class RunScope {
	public constructor(
		public readonly context: RunContext,
		public readonly definition: AgentDefinition,
		public readonly model: LlmModel,
		public readonly started: StartedRun,
		public readonly catalog: ToolCatalog,
		public readonly skills: SkillCatalog,
		public readonly limits: RunLimits,
		public readonly breaker: ToolBreaker,
		public readonly remote: readonly ToolDefinition[] = [],
		public readonly compaction?: AdkCompactionPolicy,
		private readonly resolved?: PromptInstructions,
	) {}

	public withMetadata(metadata: SessionMetadata): RunScope {
		return new RunScope(
			this.context.withMetadata(metadata),
			this.definition,
			this.model,
			this.started,
			this.catalog,
			this.skills,
			this.limits,
			this.breaker,
			this.remote,
			this.compaction,
			this.resolved,
		);
	}

	public get metadata(): SessionMetadata {
		return this.context.metadata;
	}

	public get actor(): Actor | undefined {
		return this.context.actor;
	}

	public get agent(): AgentName {
		return this.definition.name;
	}

	public get instructions(): PromptInstructions | undefined {
		return this.resolved ?? this.definition.instructions;
	}

	public get run(): AgentRun {
		return this.context.run;
	}

	public get sessionId(): SessionId {
		return this.context.sessionId;
	}

	public get signal(): AbortSignal | undefined {
		return this.context.signal;
	}
}
