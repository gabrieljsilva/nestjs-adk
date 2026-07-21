/** Public execution and session types. Runtime arrives in F3. */

export interface TokenUsage {
	promptTokens: number;
	outputTokens: number;
	totalTokens: number;
	/** Tokens served from the provider's context cache (when reported, e.g. Gemini cachedContent). */
	cachedTokens?: number;
}

/** Reference to the source: native engine event + the provider's original payload. Nothing is discarded. */
export interface RawRef {
	event?: unknown;
	response?: unknown;
}

export type AgentEvent =
	| { type: "run_start"; agent: string; sessionId?: string; raw?: RawRef }
	| { type: "llm_response"; agent: string; text?: string; usage?: TokenUsage; raw?: RawRef }
	| { type: "tool_call"; agent: string; callId: string; tool: string; args: unknown; raw?: RawRef }
	| { type: "tool_result"; agent: string; callId: string; tool: string; result: unknown; raw?: RawRef }
	| { type: "agent_transfer"; from: string; to: string; raw?: RawRef }
	| { type: "model_rerouted"; from: string; to: string; reason: string; raw?: RawRef }
	| { type: "approval_required"; agent: string; callId: string; tool: string; args: unknown; raw?: RawRef }
	| { type: "final"; agent: string; text: string; usage: TokenUsage; raw?: RawRef };

export interface RunInput {
	message: string;
	/** Absent → ephemeral session (state only during the run). */
	sessionId?: string;
	userId?: string;
	/** Initial stateDelta. */
	state?: Record<string, unknown>;
	/** Custom attributes visible in the ToolContext. */
	attributes?: Record<string, unknown>;
	/** Billing/cost tracking per run (Vertex). */
	labels?: Record<string, string>;
	signal?: AbortSignal;
	/** Per-call override of the agent/module maxIterations. */
	maxIterations?: number;
	/** Per-call override of the agent/module maxConsecutiveToolFailures. */
	maxConsecutiveToolFailures?: number;
	/** Filled in by the AgentRunner for persistent sessions: history BEFORE the current message. Engines use it to hydrate the context. */
	history?: SessionEvent[];
}

export interface PendingApproval {
	callId: string;
	tool: string;
	args: unknown;
	agent: string;
}

export interface RunResult<TOutput = unknown> {
	text: string;
	/** Validated structured output (F6) — present when the agent declares `output`. */
	output?: TOutput;
	usage: TokenUsage;
	/** Complete run trace — the basis for test assertions. */
	events: AgentEvent[];
	status: "completed" | "pending_approval";
	pending?: PendingApproval[];
}

// ---------- session ----------

export interface SessionEvent {
	/** Serialization format version — migration is the core's responsibility. */
	v: 1;
	id: string;
	/** epoch ms */
	at: number;
	author: "user" | "agent" | "system" | "tool";
	type: string;
	data: Record<string, unknown>;
}

export interface Session {
	id: string;
	userId?: string;
	state: Record<string, unknown>;
	events: SessionEvent[];
	createdAt: Date;
	updatedAt: Date;
}

export interface SessionInit {
	id?: string;
	userId?: string;
	state?: Record<string, unknown>;
}

// ---------- artifacts ----------

export interface ArtifactRef {
	sessionId: string;
	name: string;
}

export interface ArtifactPart {
	mimeType: string;
	/** Text or base64 content. */
	data: string;
}
