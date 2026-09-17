import { AgentRunId } from "../../common/identity/agent-run-id.value-object";
import { CorrelationId } from "../../common/identity/correlation-id.value-object";
import type { IdGenerator } from "../../common/identity/id-generator.contract";
import type { SessionId } from "../../common/identity/session-id.value-object";
import type { Clock } from "../../common/time/clock.contract";
import type { AgentName } from "../../domain/agent/agent-name.value-object";
import { AgentRun } from "../../domain/session/run/agent-run.entity";
import type { ActiveRunTracker } from "../lifecycle/active-run-tracker.service";
import { RunCancellation } from "../lifecycle/run-cancellation.service";
import type { RuntimeLifecycle } from "../lifecycle/runtime-lifecycle.service";
import { StartedRun } from "./settle/started-run.value-object";

const CALLER_ABORTED = "the caller aborted the run";

export class AgentRunFactory {
	public constructor(
		private readonly ids: IdGenerator,
		private readonly clock: Clock,
		private readonly tracker: ActiveRunTracker,
		private readonly lifecycle: RuntimeLifecycle,
	) {}

	public start(sessionId: SessionId, agent: AgentName, signal?: AbortSignal): StartedRun {
		this.lifecycle.assertAcceptsCommands();

		const run = AgentRun.start(
			AgentRunId.from(this.ids.next()),
			sessionId,
			agent,
			this.clock.now(),
			CorrelationId.from(this.ids.next()),
		);
		const cancellation = this.buildCancellation(signal);
		this.tracker.track(run.id, cancellation);
		return new StartedRun(run, cancellation);
	}

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

	public resume(sessionId: SessionId, agent: AgentName, resumedRunId: AgentRunId, signal?: AbortSignal): StartedRun {
		this.lifecycle.assertAcceptsCommands();

		const run = AgentRun.resumingFrom(
			AgentRunId.from(this.ids.next()),
			sessionId,
			agent,
			this.clock.now(),
			CorrelationId.from(this.ids.next()),
			resumedRunId,
		);
		const cancellation = this.buildCancellation(signal);
		this.tracker.track(run.id, cancellation);
		return new StartedRun(run, cancellation);
	}

	public finish(run: AgentRun): void {
		this.tracker.release(run.id);
	}

	public async untilFinished<T>(started: StartedRun, body: () => Promise<T>): Promise<T> {
		try {
			return await body();
		} finally {
			this.finish(started.run);
		}
	}

	private buildCancellation(signal?: AbortSignal): RunCancellation {
		const cancellation = new RunCancellation();
		if (signal === undefined) return cancellation;
		signal.addEventListener("abort", () => cancellation.cancel(CALLER_ABORTED), { once: true });
		if (signal.aborted) cancellation.cancel(CALLER_ABORTED);
		return cancellation;
	}
}
