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
