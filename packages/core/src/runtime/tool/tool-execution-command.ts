import type { AgentRunId } from "../../common/identity/agent-run-id";
import type { SessionId } from "../../common/identity/session-id";
import type { AgentName } from "../../domain/agent/agent-name";
import type { ToolInvocation } from "../../domain/tool/tool-invocation";
import type { ToolCatalog } from "./tool-catalog";

/**
 * One tool call to run, with everything the decision around it depends on.
 *
 * The catalog travels with the command rather than living in the executor, because the
 * tools on offer belong to the agent that is active right now, and an agent can be
 * transferred to in the middle of a run.
 */
export class ToolExecutionCommand {
	public constructor(
		public readonly sessionId: SessionId,
		public readonly runId: AgentRunId,
		public readonly agent: AgentName,
		public readonly catalog: ToolCatalog,
		public readonly invocation: ToolInvocation,
		public readonly signal?: AbortSignal,
		/** Set only when a human already agreed to this exact call, which is what resuming means. */
		public readonly approved: boolean = false,
	) {}
}
