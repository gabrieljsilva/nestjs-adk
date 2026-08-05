/**
 * The abort signal of a single run, owned by that run alone.
 * Two concurrent commands never share one, so aborting a run that timed out during
 * drain leaves the others untouched.
 */
export class RunCancellation {
	private readonly controller = new AbortController();

	public get signal(): AbortSignal {
		return this.controller.signal;
	}

	public get isCancelled(): boolean {
		return this.controller.signal.aborted;
	}

	public cancel(reason: string): void {
		if (this.controller.signal.aborted) return;
		this.controller.abort(reason);
	}
}
