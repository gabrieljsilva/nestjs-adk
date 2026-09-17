/**
 * Scripted model double, in the language test frameworks already use.
 *
 * Turns are consumed in order: every `mockReplyOnce` answers a single call, and
 * `mockReply` answers everything after the queue drains. Requests are recorded as
 * typed data, so assertions read them without any framework specific spy.
 *
 * This block ships the skeleton. `TRequest` is bound to the real model request, and
 * the tool call, chunk and failure turns arrive with the native model contract.
 */
export class TestingModel<TRequest = unknown> {
	private readonly queue: string[] = [];
	private readonly recorded: TRequest[] = [];
	private standing?: string;

	/** Answers a single call, in the order the turns were stacked. */
	public mockReplyOnce(text: string): this {
		this.queue.push(text);
		return this;
	}

	/** Answers every call the queued turns do not cover. */
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

	/** Records the request and answers with the next scripted turn. */
	public reply(request: TRequest): string {
		this.recorded.push(request);
		const next = this.queue.shift();
		if (next !== undefined) return next;
		if (this.standing !== undefined) return this.standing;
		throw new Error("TestingModel ran out of scripted turns; stack one with mockReplyOnce or mockReply.");
	}
}
