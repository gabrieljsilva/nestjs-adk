import type { AgentRunId } from "../../common/identity/agent-run-id";
import type { RunCancellation } from "./run-cancellation";

/**
 * The runs currently executing, and the handle that can stop each one.
 * Drain waits on this set; a run leaves it when it settles, however it settles.
 */
export class ActiveRunTracker {
	private readonly running = new Map<string, RunCancellation>();
	private readonly waiters: Array<() => void> = [];

	public get size(): number {
		return this.running.size;
	}

	public get isEmpty(): boolean {
		return this.running.size === 0;
	}

	public track(runId: AgentRunId, cancellation: RunCancellation): void {
		this.running.set(runId.value, cancellation);
	}

	public release(runId: AgentRunId): void {
		this.running.delete(runId.value);
		if (this.running.size > 0) return;
		for (const waiter of this.waiters.splice(0)) waiter();
	}

	/** Resolves as soon as no run is left, including when none was running to begin with. */
	public async whenIdle(): Promise<void> {
		if (this.isEmpty) return;
		await new Promise<void>((resolve) => this.waiters.push(resolve));
	}

	public cancelAll(reason: string): void {
		for (const cancellation of this.running.values()) cancellation.cancel(reason);
	}
}
