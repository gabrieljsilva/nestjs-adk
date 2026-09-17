export class TestingModel<TRequest = unknown> {
	private readonly queue: string[] = [];
	private readonly recorded: TRequest[] = [];
	private standing?: string;

	public mockReplyOnce(text: string): this {
		this.queue.push(text);
		return this;
	}

	public mockReply(text: string): this {
		this.standing = text;
		return this;
	}

	public get calls(): readonly TRequest[] {
		return this.recorded;
	}

	public get lastCall(): TRequest | undefined {
		return this.recorded.at(-1);
	}

	public reply(request: TRequest): string {
		this.recorded.push(request);
		const next = this.queue.shift();
		if (next !== undefined) return next;
		if (this.standing !== undefined) return this.standing;
		throw new Error("TestingModel ran out of scripted turns; stack one with mockReplyOnce or mockReply.");
	}
}
