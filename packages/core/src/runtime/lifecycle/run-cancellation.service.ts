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
