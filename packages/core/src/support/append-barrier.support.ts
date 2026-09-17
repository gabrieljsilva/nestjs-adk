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
