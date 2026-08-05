/**
 * What a tool sees in `execute(input, ctx)`.
 * TState is a manual annotation (a tool can serve many agents, so the running agent's schema
 * cannot be inferred): `ctx: ToolContext<z.infer<typeof MyState>>`. A union of states narrows
 * access to the keys all of them share, the safe contract for a shared tool.
 */
export interface ToolContext<TState extends Record<string, unknown> = Record<string, unknown>> {
	agentName: string;
	sessionId?: string;
	userId?: string;
	/** Mutations become the session's stateDelta. */
	state: StateBag<TState>;
	/** Custom attributes passed to ask()/run(). */
	attributes: Record<string, unknown>;
	signal: AbortSignal;
	actions: { endRun(): void };
}

export interface StateBag<TState extends Record<string, unknown> = Record<string, unknown>> {
	/** Key-typed read: autocomplete + inferred return when TState is declared. */
	// The V type param blocks explicit-generic calls from landing here (arity), keeping get<T>(key) intact.
	get<K extends keyof TState & string, V extends TState[K]>(key: K): V | undefined;
	/** Explicit-generic read: undeclared keys and pre-typing code. */
	get<T = unknown>(key: string): T | undefined;
	/** Runtime-validated against the agent's declared state schema (undeclared keys pass through). */
	set<K extends keyof TState & string>(key: K, value: TState[K]): void;
	/** Read that throws AgentStateMissingError when the key is absent or undefined. */
	require<K extends keyof TState & string, V extends TState[K]>(key: K): V;
	require<T = unknown>(key: string): T;
}
