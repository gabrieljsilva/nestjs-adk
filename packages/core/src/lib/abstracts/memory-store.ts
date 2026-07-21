/** Long-term memory contract. Implementations arrive post-v1; the contract anchors DI. */
export abstract class MemoryStore {
	public abstract ingest(entry: {
		sessionId: string;
		content: string;
		metadata?: Record<string, unknown>;
	}): Promise<void>;
	public abstract search(query: string, scope?: { userId?: string }): Promise<Array<{ content: string; score: number }>>;
}
