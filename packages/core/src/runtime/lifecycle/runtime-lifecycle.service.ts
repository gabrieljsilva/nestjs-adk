import type { Clock } from "../../common/time/clock.contract";
import { ActiveRunTracker } from "./active-run-tracker.service";
import { RuntimeNotAcceptingCommandsError } from "./errors/runtime-not-accepting-commands.error";
import { RuntimeState } from "./runtime-state.value-object";
import { ShutdownOptions } from "./shutdown.options";

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
			timer.unref?.();
		});
	}
}
