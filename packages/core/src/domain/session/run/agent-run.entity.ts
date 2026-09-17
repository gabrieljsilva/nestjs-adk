import type { AgentRunId } from "../../../common/identity/agent-run-id.value-object";
import type { CorrelationId } from "../../../common/identity/correlation-id.value-object";
import type { SessionId } from "../../../common/identity/session-id.value-object";
import type { Instant } from "../../../common/time/instant.value-object";
import type { AgentName } from "../../agent/agent-name.value-object";
import { AgentRunStatus } from "./agent-run-status.value-object";

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
