import type { Clock } from "../../common/time/clock";
import { ActiveRunTracker } from "./active-run-tracker";
import { RuntimeNotAcceptingCommandsError } from "./errors/runtime-not-accepting-commands.error";
import { RuntimeState } from "./runtime-state";
import { ShutdownOptions } from "./shutdown-options";

/**
 * The `active` to `draining` to `stopped` machine.
 *
 * Draining refuses new commands and waits for the ones already running. With a
 * timeout it aborts whatever is left when the time is up; without one it waits as
 * long as needed. Reaching `stopped` twice is a no op, so a second close is safe.
 */
export class RuntimeLifecycle {
	private state = RuntimeState.ACTIVE;

	public constructor(
		private readonly tracker: ActiveRunTracker,
		private readonly options: ShutdownOptions = ShutdownOptions.waitIndefinitely(),
		private readonly clock?: Clock,
	) {}

	public get current(): RuntimeState {
		return this.state;
	}

	/** Throws when the runtime can no longer take work, and is the single place that decides it. */
	public assertAcceptsCommands(): void {
		if (this.state.acceptsCommands) return;
		throw new RuntimeNotAcceptingCommandsError(this.state.name);
	}

	public async drain(): Promise<void> {
		if (this.state.equals(RuntimeState.STOPPED)) return;
		this.state = RuntimeState.DRAINING;

		await this.waitForRuns();

		this.tracker.cancelAll("runtime shutdown");
		this.state = RuntimeState.STOPPED;
	}

	private async waitForRuns(): Promise<void> {
		const timeoutMs = this.options.timeoutMs;
		if (timeoutMs === undefined) {
			await this.tracker.whenIdle();
			return;
		}
		await Promise.race([this.tracker.whenIdle(), this.elapse(timeoutMs)]);
	}

	private elapse(milliseconds: number): Promise<void> {
		return new Promise<void>((resolve) => {
			const timer = setTimeout(resolve, milliseconds);
			// The process must not be held open by a shutdown timer that already lost the race.
			timer.unref?.();
		});
	}
}
