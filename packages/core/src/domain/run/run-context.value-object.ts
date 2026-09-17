import type { AgentRunId } from "../../common/identity/agent-run-id.value-object";
import type { SessionId } from "../../common/identity/session-id.value-object";
import type { ToolCallId } from "../../common/identity/tool-call-id.value-object";
import type { SessionRevision } from "../../common/revision/session-revision.value-object";
import type { Instant } from "../../common/time/instant.value-object";
import type { AgentName } from "../agent/agent-name.value-object";
import type { SessionMetadata } from "../session/metadata/session-metadata.value-object";
import type { AgentRun } from "../session/run/agent-run.entity";
import type { Session } from "../session/session.entity";
import type { SessionState } from "../session/state/session-state.value-object";
import type { Actor } from "../tool/access/actor.value-object";
import { ToolContext } from "../tool/invocation/tool-context.value-object";
import { SessionContext } from "./session-context.value-object";

/**
 * Everything one invocation is told about where it is running: the durable conversation, plus
 * this run's id, actor, stop button and, for a delegation, the run that asked. Every port the
 * runtime consults takes one as its first parameter.
 */
export class RunContext extends SessionContext {
	private constructor(
		sessionId: SessionId,
		metadata: SessionMetadata,
		revision: SessionRevision,
		public readonly activeAgent: AgentName,
		public readonly run: AgentRun,
		public readonly signal?: AbortSignal,
		public readonly actor?: Actor,
		public readonly parent?: RunContext,
	) {
		super(sessionId, metadata, revision);
	}

	public static fromOpenedSession(
		session: Session,
		state: SessionState,
		run: AgentRun,
		invocation: { readonly signal?: AbortSignal; readonly actor?: Actor } = {},
	): RunContext {
		return new RunContext(
			session.id,
			state.metadata,
			state.revision,
			state.activeAgent ?? session.rootAgent,
			run,
			invocation.signal,
			invocation.actor,
		);
	}

	public get runId(): AgentRunId {
		return this.run.id;
	}

	public get startedAt(): Instant {
		return this.run.startedAt;
	}

	public get depth(): number {
		return this.run.depth;
	}

	public get isCancelled(): boolean {
		return this.signal?.aborted === true;
	}

	public withMetadata(metadata: SessionMetadata): RunContext {
		return new RunContext(
			this.sessionId,
			metadata,
			this.revision,
			this.activeAgent,
			this.run,
			this.signal,
			this.actor,
			this.parent,
		);
	}

	public withRevision(revision: SessionRevision): RunContext {
		return new RunContext(
			this.sessionId,
			this.metadata,
			revision,
			this.activeAgent,
			this.run,
			this.signal,
			this.actor,
			this.parent,
		);
	}

	public withActiveAgent(agent: AgentName): RunContext {
		return new RunContext(
			this.sessionId,
			this.metadata,
			this.revision,
			agent,
			this.run,
			this.signal,
			this.actor,
			this.parent,
		);
	}

	public delegatedTo(run: AgentRun, signal?: AbortSignal): RunContext {
		return new RunContext(this.sessionId, this.metadata, this.revision, run.agent, run, signal, this.actor, this);
	}

	public withRun(run: AgentRun, signal?: AbortSignal): RunContext {
		return new RunContext(
			this.sessionId,
			this.metadata,
			this.revision,
			this.activeAgent,
			run,
			signal ?? this.signal,
			this.actor,
			this.parent,
		);
	}

	public toToolContext(callId: ToolCallId): ToolContext {
		return new ToolContext(this.sessionId, this.runId, this.activeAgent, callId, this.signal, this.actor, this.metadata);
	}
}
