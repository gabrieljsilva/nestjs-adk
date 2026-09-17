import type { AgentRunId } from "../../common/identity/agent-run-id.value-object";
import type { SessionId } from "../../common/identity/session-id.value-object";
import type { AgentName } from "../../domain/agent/agent-name.value-object";
import type { RunContext } from "../../domain/run/run-context.value-object";
import type { Actor } from "../../domain/tool/access/actor.value-object";
import type { ToolContext } from "../../domain/tool/invocation/tool-context.value-object";
import type { ToolInvocation } from "../../domain/tool/invocation/tool-invocation.value-object";
import type { ToolCatalog } from "./tool-catalog.service";

export class ToolExecutionCommand {
	public constructor(
		public readonly context: RunContext,
		public readonly catalog: ToolCatalog,
		public readonly invocation: ToolInvocation,
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

	public toToolContext(): ToolContext {
		return this.context.toToolContext(this.invocation.callId);
	}
}
