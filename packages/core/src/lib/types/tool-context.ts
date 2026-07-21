/** What a tool sees in `execute(input, ctx)`. Runtime implementation in phases 3/4. */
export interface ToolContext {
	agentName: string;
	sessionId?: string;
	userId?: string;
	/** Mutations become the session's stateDelta. */
	state: StateBag;
	/** Custom attributes passed to ask()/run(). */
	attributes: Record<string, unknown>;
	signal: AbortSignal;
	actions: { endRun(): void };
}

export interface StateBag {
	get<T = unknown>(key: string): T | undefined;
	set(key: string, value: unknown): void;
}
