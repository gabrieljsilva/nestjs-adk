/**
 * One read per file for the life of the process, and one read for concurrent askers.
 *
 * A prompt file does not change while an application is running, and reading it per run
 * would put a syscall in front of every conversation. What is stored is the read itself
 * rather than its result, so ten runs starting at once share one open: storing the result
 * would let all ten miss the cache before the first one finished.
 *
 * Neither an absence nor a failure is kept. A file added after the first miss is found next
 * time, and a permission fixed after a failure stops failing, which is what makes a cache
 * different from a decision.
 */
export class PromptFileCache {
	private readonly entries = new Map<string, Promise<string | undefined>>();

	public through(key: string, read: () => Promise<string | undefined>): Promise<string | undefined> {
		const cached = this.entries.get(key);
		if (cached !== undefined) return cached;
		const reading = read().then(
			(text) => {
				if (text === undefined) this.entries.delete(key);
				return text;
			},
			(cause: unknown) => {
				this.entries.delete(key);
				throw cause;
			},
		);
		this.entries.set(key, reading);
		return reading;
	}
}
