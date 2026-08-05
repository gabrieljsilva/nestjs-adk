import { AgentRunId } from "../../common/identity/agent-run-id";
import { CorrelationId } from "../../common/identity/correlation-id";
import type { IdGenerator } from "../../common/identity/id-generator";
import type { SessionId } from "../../common/identity/session-id";
import type { Clock } from "../../common/time/clock";
import type { AgentName } from "../../domain/agent/agent-name";
import { AgentRun } from "../../domain/session/agent-run";
import type { ActiveRunTracker } from "../lifecycle/active-run-tracker";
import { RunCancellation } from "../lifecycle/run-cancellation";
import type { RuntimeLifecycle } from "../lifecycle/runtime-lifecycle";
import { StartedRun } from "./started-run";

/**
 * Creates one run per command, without a container scope.
 *
 * Nothing per run lives in the container: the run and its cancellation are plain
 * objects handed to the caller, which is what keeps singleton agents free of any
 * state belonging to a request.
 */
export class AgentRunFactory {
	public constructor(
		private readonly ids: IdGenerator,
		private readonly clock: Clock,
		private readonly tracker: ActiveRunTracker,
		private readonly lifecycle: RuntimeLifecycle,
	) {}

	public start(sessionId: SessionId, agent: AgentName): StartedRun {
		this.lifecycle.assertAcceptsCommands();

		const run = AgentRun.start(
			AgentRunId.from(this.ids.next()),
			sessionId,
			agent,
			this.clock.now(),
			CorrelationId.from(this.ids.next()),
		);
		const cancellation = new RunCancellation();
		this.tracker.track(run.id, cancellation);
		return new StartedRun(run, cancellation);
	}

	/**
	 * Opens the child run of a delegation, under the delegation's own correlation.
	 *
	 * The child's cancellation is derived from the parent's: a parent that is cancelled or
	 * drained takes its children with it, because a child nobody is waiting for is work
	 * somebody is still paying for. The reverse does not hold, since a child that failed is
	 * an answer the parent still has to deal with.
	 */
	public delegate(parent: StartedRun, agent: AgentName, delegationId: CorrelationId): StartedRun {
		this.lifecycle.assertAcceptsCommands();

		const run = AgentRun.delegated(AgentRunId.from(this.ids.next()), parent.run, agent, this.clock.now(), delegationId);
		const cancellation = new RunCancellation();
		parent.cancellation.signal.addEventListener("abort", () => cancellation.cancel("the parent run was cancelled"), {
			once: true,
		});
		if (parent.cancellation.isCancelled) cancellation.cancel("the parent run was cancelled");
		this.tracker.track(run.id, cancellation);
		return new StartedRun(run, cancellation);
	}

	/** Continues a run that was suspended, under a new id that points back at the old one. */
	public resume(sessionId: SessionId, agent: AgentName, resumedRunId: AgentRunId): StartedRun {
		this.lifecycle.assertAcceptsCommands();

		const run = AgentRun.resumingFrom(
			AgentRunId.from(this.ids.next()),
			sessionId,
			agent,
			this.clock.now(),
			CorrelationId.from(this.ids.next()),
			resumedRunId,
		);
		const cancellation = new RunCancellation();
		this.tracker.track(run.id, cancellation);
		return new StartedRun(run, cancellation);
	}

	public finish(run: AgentRun): void {
		this.tracker.release(run.id);
	}
}
