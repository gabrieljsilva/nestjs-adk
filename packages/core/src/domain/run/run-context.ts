import type { AgentRunId } from "../../common/identity/agent-run-id";
import type { SessionId } from "../../common/identity/session-id";
import type { ToolCallId } from "../../common/identity/tool-call-id";
import type { SessionRevision } from "../../common/revision/session-revision";
import type { Instant } from "../../common/time/instant";
import type { AgentName } from "../agent/agent-name";
import type { AgentRun } from "../session/agent-run";
import type { Session } from "../session/session";
import type { SessionMetadata } from "../session/session-metadata";
import type { SessionState } from "../session/session-state";
import type { Actor } from "../tool/actor";
import { ToolContext } from "../tool/tool-context";
import { SessionContext } from "./session-context";

/**
 * Everything one invocation is told about where it is running, in one value.
 *
 * It has two halves and the difference between them is how long each one is true for. The
 * durable half is the conversation: its id, what the application knows about it, how far
 * its journal has advanced and which agent answers for it. That half is rebuilt from the
 * session on every open and never carried across a process. The invocation half is this
 * question and nothing else: the run's id, who asked, the stop button, when it began and,
 * for a delegation, the context it was asked from. It dies when the run settles.
 *
 * Every port the runtime consults takes one as its first parameter, so an adapter written
 * outside this package reads the same facts the runtime reads, including metadata an
 * application wrote for exactly that purpose. Nothing resolved by the runtime lives here:
 * the model, the catalog and the limits are `RunScope`, which holds a context rather than
 * repeating it.
 *
 * A service receives it as a parameter and never keeps it in a field. Two runs share one
 * service instance, so a field is state that leaks between them.
 */
export class RunContext extends SessionContext {
	private constructor(
		sessionId: SessionId,
		metadata: SessionMetadata,
		revision: SessionRevision,
		/** The agent answering in this run: the session's own, or whoever took over or was delegated to. */
		public readonly activeAgent: AgentName,
		public readonly run: AgentRun,
		public readonly signal?: AbortSignal,
		public readonly actor?: Actor,
		/** The run that delegated this one, absent for every run a caller asked for directly. */
		public readonly parent?: RunContext,
	) {
		super(sessionId, metadata, revision);
	}

	/**
	 * The context a run begins under: the opened session, folded, plus what the command carried.
	 *
	 * It is built once, at the start of the use case, and extended from there. Rebuilding it
	 * from the session on every open is what makes it durable rather than remembered.
	 */
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

	/** How many delegations deep this run is, which is what bounds a chain of them. */
	public get depth(): number {
		return this.run.depth;
	}

	public get isCancelled(): boolean {
		return this.signal?.aborted === true;
	}

	/**
	 * The same run, now reading metadata a tool of this run just wrote.
	 *
	 * A set lands on the turn's commit, so the fold moves while the run is still going; the
	 * later calls of the same run have to read what the earlier ones wrote, or a tool would be
	 * the one component that cannot see its own write.
	 */
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

	/** The same run after a handover, which moves who answers and nothing else. */
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

	/**
	 * The child of a delegation, pointing back at the run that asked for it.
	 *
	 * The conversation is the same one, so the metadata travels across untouched and the child
	 * reads what the parent reads. What changes is the agent answering, the run, its stop
	 * button and the fact that it now has a parent.
	 */
	public delegatedTo(run: AgentRun, signal?: AbortSignal): RunContext {
		return new RunContext(this.sessionId, this.metadata, this.revision, run.agent, run, signal, this.actor, this);
	}

	/** The same run under another run object: a resumption, or a child of this very context. */
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

	/** What one tool invocation of this run is handed, which is this context narrowed to a call. */
	public toToolContext(callId: ToolCallId): ToolContext {
		return new ToolContext(this.sessionId, this.runId, this.activeAgent, callId, this.signal, this.actor, this.metadata);
	}
}
