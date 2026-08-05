import type { AgentRunId } from "../../common/identity/agent-run-id";
import type { CorrelationId } from "../../common/identity/correlation-id";
import type { SessionId } from "../../common/identity/session-id";
import type { Instant } from "../../common/time/instant";
import type { AgentName } from "../agent/agent-name";
import { AgentRunStatus } from "./agent-run-status";

/**
 * One command execution inside a session.
 *
 * A suspended run never resumes under its own id: the command that continues it is a
 * new run pointing back through `resumedRunId`, so the journal shows both the pause
 * and what came after it instead of rewriting history.
 */
export class AgentRun {
	private constructor(
		public readonly id: AgentRunId,
		public readonly sessionId: SessionId,
		public readonly agent: AgentName,
		public readonly status: AgentRunStatus,
		public readonly startedAt: Instant,
		public readonly correlationId: CorrelationId,
		public readonly parentRunId?: AgentRunId,
		public readonly resumedRunId?: AgentRunId,
		/** How many delegations deep this run is, which is what bounds a chain of them. */
		public readonly depth: number = 0,
	) {}

	public static start(
		id: AgentRunId,
		sessionId: SessionId,
		agent: AgentName,
		startedAt: Instant,
		correlationId: CorrelationId,
	): AgentRun {
		return new AgentRun(id, sessionId, agent, AgentRunStatus.RUNNING, startedAt, correlationId);
	}

	/** A child run of a delegation, correlated to the run that asked for it. */
	public static delegated(
		id: AgentRunId,
		parent: AgentRun,
		agent: AgentName,
		startedAt: Instant,
		correlationId: CorrelationId,
	): AgentRun {
		return new AgentRun(
			id,
			parent.sessionId,
			agent,
			AgentRunStatus.RUNNING,
			startedAt,
			correlationId,
			parent.id,
			undefined,
			parent.depth + 1,
		);
	}

	/**
	 * The run that continues a suspended one, named only by its id.
	 * A process that restarted never held the suspended run, only the journal that
	 * mentions it, so this is what resumption looks like from the other side of a restart.
	 */
	public static resumingFrom(
		id: AgentRunId,
		sessionId: SessionId,
		agent: AgentName,
		startedAt: Instant,
		correlationId: CorrelationId,
		resumedRunId: AgentRunId,
	): AgentRun {
		return new AgentRun(id, sessionId, agent, AgentRunStatus.RUNNING, startedAt, correlationId, undefined, resumedRunId);
	}

	/** The run that continues a suspended one, carrying a distinct id by design. */
	public static resuming(id: AgentRunId, suspended: AgentRun, startedAt: Instant): AgentRun {
		return new AgentRun(
			id,
			suspended.sessionId,
			suspended.agent,
			AgentRunStatus.RUNNING,
			startedAt,
			suspended.correlationId,
			suspended.parentRunId,
			suspended.id,
			suspended.depth,
		);
	}

	public get isDelegated(): boolean {
		return this.parentRunId !== undefined;
	}

	public get isResumption(): boolean {
		return this.resumedRunId !== undefined;
	}
}
