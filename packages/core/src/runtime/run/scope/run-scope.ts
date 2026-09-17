import type { SessionId } from "../../../common/identity/session-id";
import type { AgentDefinition } from "../../../domain/agent/agent-definition";
import type { AgentName } from "../../../domain/agent/agent-name";
import type { AdkCompactionPolicy } from "../../../domain/context/adk-compaction-policy";
import type { LlmModel } from "../../../domain/model/llm-model";
import type { PromptInstructions } from "../../../domain/prompt/prompt-instructions";
import type { RunContext } from "../../../domain/run/run-context";
import type { SessionMetadata } from "../../../domain/session/metadata/session-metadata";
import type { AgentRun } from "../../../domain/session/run/agent-run";
import type { RunLimits } from "../../../domain/session/run/run-limits";
import type { Actor } from "../../../domain/tool/access/actor";
import type { ToolDefinition } from "../../../domain/tool/tool-definition";
import type { SkillCatalog } from "../../skill/skill-catalog";
import type { ToolBreaker } from "../../tool/tool-breaker";
import type { ToolCatalog } from "../../tool/tool-catalog";
import type { StartedRun } from "../settle/started-run";

/**
 * Everything one run resolved before it began, in one place.
 *
 * Which agent, which model, which tools, which skills and how far it may go are all
 * decided once and then read many times, by the loop, by the executor and by whatever
 * records what happened. Passing them one by one turned every signature into a list of
 * seven things, and every new capability into a change in each of them.
 *
 * The breaker travels here too. It counts within one run and is meaningless outside it,
 * so it belongs to the same lifetime as the rest.
 */
export class RunScope {
	public constructor(
		/** Where this run is happening, read by everything the scope hands itself to. */
		public readonly context: RunContext,
		public readonly definition: AgentDefinition,
		public readonly model: LlmModel,
		public readonly started: StartedRun,
		public readonly catalog: ToolCatalog,
		public readonly skills: SkillCatalog,
		public readonly limits: RunLimits,
		public readonly breaker: ToolBreaker,
		/** What the run's tool sources opened, kept so a handover can rebuild the catalog with it. */
		public readonly remote: readonly ToolDefinition[] = [],
		/** Already resolved from the module and the agent, so the loop never asks twice. */
		public readonly compaction?: AdkCompactionPolicy,
		/** What the agent's own `prompt()` answered for this run, when it has one. */
		private readonly resolved?: PromptInstructions,
	) {}

	/** The same scope reading metadata a tool of this run just wrote. */
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

	/** The session's durable metadata, carried so a handover and a delegation read the same facts. */
	public get metadata(): SessionMetadata {
		return this.context.metadata;
	}

	/** Who asked, handed to every tool of this run, a handover and a delegation included. */
	public get actor(): Actor | undefined {
		return this.context.actor;
	}

	public get agent(): AgentName {
		return this.definition.name;
	}

	/**
	 * The prompt this run answers under: the one built for it, or the one declared statically.
	 *
	 * Both cannot exist at once, since an agent that declared a prompt twice is refused at
	 * boot, so this reads as one question rather than a precedence rule. The loop asks the
	 * scope rather than the definition precisely because of the first case: a prompt built per
	 * run is resolved once, here, and read on every turn.
	 */
	public get instructions(): PromptInstructions | undefined {
		return this.resolved ?? this.definition.instructions;
	}

	public get run(): AgentRun {
		return this.context.run;
	}

	public get sessionId(): SessionId {
		return this.context.sessionId;
	}

	/** What stops the run from outside, handed to every tool and every model call it makes. */
	public get signal(): AbortSignal | undefined {
		return this.context.signal;
	}
}
