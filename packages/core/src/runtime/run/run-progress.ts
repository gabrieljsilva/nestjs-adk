import type { SessionState } from "../../domain/session/session-state";

/**
 * How far one run has got, while it is still getting there.
 *
 * It is deliberately mutable, and it is the only mutable thing in a run. The loop has to
 * be resumable from wherever it stopped in order to record why it stopped, and the two
 * facts it needs for that are where the journal is and what the model last said. Passing
 * them back through every return value would thread bookkeeping through code that is
 * about something else.
 *
 * It belongs to one run and never outlives it, so nothing shared is ever mutated here.
 */
export class RunProgress {
	private text = "";
	private waiting = false;

	public constructor(private current: SessionState) {}

	public get state(): SessionState {
		return this.current;
	}

	/** What the model last said, which is what the caller of `ask` is waiting for. */
	public get answer(): string {
		return this.text;
	}

	public advanced(state: SessionState): void {
		this.current = state;
	}

	public said(text: string): void {
		this.text = text;
	}

	/** The run stopped to wait for a human, which is an ending and not a pause. */
	public suspend(): void {
		this.waiting = true;
	}

	public get isSuspended(): boolean {
		return this.waiting;
	}
}
