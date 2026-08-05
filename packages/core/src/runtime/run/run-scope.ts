import type { SessionId } from "../../common/identity/session-id";
import type { AgentDefinition } from "../../domain/agent/agent-definition";
import type { AgentName } from "../../domain/agent/agent-name";
import type { LlmModel } from "../../domain/model/llm-model";
import type { AgentRun } from "../../domain/session/agent-run";
import type { RunLimits } from "../../domain/session/run-limits";
import type { ToolDefinition } from "../../domain/tool/tool-definition";
import type { SkillCatalog } from "../skill/skill-catalog";
import type { ToolBreaker } from "../tool/tool-breaker";
import type { ToolCatalog } from "../tool/tool-catalog";
import type { StartedRun } from "./started-run";

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
		public readonly definition: AgentDefinition,
		public readonly model: LlmModel,
		public readonly started: StartedRun,
		public readonly catalog: ToolCatalog,
		public readonly skills: SkillCatalog,
		public readonly limits: RunLimits,
		public readonly breaker: ToolBreaker,
		/** What the run's tool sources opened, kept so a handover can rebuild the catalog with it. */
		public readonly remote: readonly ToolDefinition[] = [],
	) {}

	public get agent(): AgentName {
		return this.definition.name;
	}

	public get run(): AgentRun {
		return this.started.run;
	}

	public get sessionId(): SessionId {
		return this.started.run.sessionId;
	}

	/** What stops the run from outside, handed to every tool and every model call it makes. */
	public get signal(): AbortSignal | undefined {
		return this.started.cancellation.signal;
	}
}
