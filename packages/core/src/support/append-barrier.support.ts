/**
 * A latch that holds callers until a test releases them.
 *
 * Concurrency is exercised without timers or real parallelism: two appends park on
 * the same barrier, the test opens it, and the outcome depends on the storage rather
 * than on which microtask happened to run first.
 */
export class AppendBarrier {
	private readonly waiting: Array<() => void> = [];
	private open = false;

	public get waitingCount(): number {
		return this.waiting.length;
	}

	public async wait(): Promise<void> {
		if (this.open) return;
		await new Promise<void>((resolve) => this.waiting.push(resolve));
	}

	public release(): void {
		this.open = true;
		for (const waiter of this.waiting.splice(0)) waiter();
	}
}
