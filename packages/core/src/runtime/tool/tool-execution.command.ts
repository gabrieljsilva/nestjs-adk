import type { AgentRunId } from "../../common/identity/agent-run-id.value-object";
import type { SessionId } from "../../common/identity/session-id.value-object";
import type { AgentName } from "../../domain/agent/agent-name.value-object";
import type { RunContext } from "../../domain/run/run-context.value-object";
import type { Actor } from "../../domain/tool/access/actor.value-object";
import type { ToolContext } from "../../domain/tool/invocation/tool-context.value-object";
import type { ToolInvocation } from "../../domain/tool/invocation/tool-invocation.value-object";
import type { ToolCatalog } from "./tool-catalog.service";

/**
 * One tool call to run, with everything the decision around it depends on.
 *
 * The catalog travels with the command rather than living in the executor, because the
 * tools on offer belong to the agent that is active right now, and an agent can be
 * transferred to in the middle of a run.
 *
 * Where the call is happening is the context and nothing else. Copying the session, the
 * run, the agent, the signal and the actor out of it was five fields that could drift
 * apart from the one value they were read from.
 */
export class ToolExecutionCommand {
	public constructor(
		public readonly context: RunContext,
		public readonly catalog: ToolCatalog,
		public readonly invocation: ToolInvocation,
		/** Set only when a human already agreed to this exact call, which is what resuming means. */
		public readonly approved: boolean = false,
	) {}

	public get sessionId(): SessionId {
		return this.context.sessionId;
	}

	public get runId(): AgentRunId {
		return this.context.runId;
	}

	public get agent(): AgentName {
		return this.context.activeAgent;
	}

	public get signal(): AbortSignal | undefined {
		return this.context.signal;
	}

	public get actor(): Actor | undefined {
		return this.context.actor;
	}

	/** What the tool itself is handed, which is this command narrowed to its own call. */
	public toToolContext(): ToolContext {
		return this.context.toToolContext(this.invocation.callId);
	}
}
