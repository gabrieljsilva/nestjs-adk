/** Public execution and session types. Runtime arrives in F3. */

import type { CallCost, RunCost } from "../pricing/pricing-types";

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
	/** `model` is the id the call was billed under, optional so third-party engines that cannot report it still compile. */
	| {
			type: "llm_response";
			agent: string;
			model?: string;
			text?: string;
			/**
			 * True on an incremental delta (token streaming). The provider also emits the aggregated
			 * response at the end of the turn, so concatenating every `text` would duplicate the answer:
			 * append the partials, or take the single non-partial one. Absent when streaming is off.
			 */
			partial?: boolean;
			usage?: TokenUsage;
			cost?: CallCost;
			raw?: RawRef;
	  }
	| { type: "tool_call"; agent: string; callId: string; tool: string; args: unknown; raw?: RawRef }
	| { type: "tool_result"; agent: string; callId: string; tool: string; result: unknown; raw?: RawRef }
	| { type: "agent_transfer"; from: string; to: string; raw?: RawRef }
	| { type: "model_rerouted"; from: string; to: string; reason: string; raw?: RawRef }
	| { type: "approval_required"; agent: string; callId: string; tool: string; args: unknown; raw?: RawRef }
	| { type: "reauth_required"; agent: string; source: string; reason: string; raw?: RawRef }
	| { type: "final"; agent: string; text: string; usage: TokenUsage; cost?: RunCost; raw?: RawRef };

export interface RunInput {
	message: string;
	/** Absent → ephemeral session (state only during the run). */
	sessionId?: string;
	/**
	 * Id of the session event that ALREADY carries `message`, for an app that persisted the user's
	 * turn before the run started. The runner excludes it from the history it hydrates and skips
	 * writing the message again; without it the model would see the same question twice.
	 */
	messageEventId?: string;
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
	/** Per-call override of the agent/module maxInvalidArgs. */
	maxInvalidArgs?: number;
	/**
	 * Which tool effects pause for human approval this run. Resolution: ask() > forRoot defaults >
	 * "destructive". The policy reads `effect` on the resolved tool, wherever the tool came from.
	 */
	approval?: import("./options").ApprovalPolicy;
	/** Per-call override of the module `streaming`. On → `llm_response` also arrives as partial deltas. */
	streaming?: boolean;
	/**
	 * Tool sources for THIS run: typically the integrations the end user connected. Opened while the
	 * agent is resolved and closed when the run ends. Omitted means the agent runs with the tools it
	 * declares and nothing else, which is what makes a forgotten `sources` harmless.
	 */
	sources?: import("../abstracts/adk-tool-source").AdkToolSource[];
	/** Filled in by the AgentRunner for persistent sessions: history BEFORE the current message. Engines use it to hydrate the context. */
	history?: SessionEvent[];
	/** Filled in by the AgentRunner when diagnostics are on: engines push one snapshot per model call. */
	capture?: import("../diagnostics/context-types").ContextSnapshot[];
}

export interface PendingApproval {
	callId: string;
	tool: string;
	args: unknown;
	agent: string;
	/**
	 * The run's state, frozen when approval was requested, so `approve()` resumes the turn with the
	 * scope it had rather than with whatever the session happens to hold later. It is persisted with
	 * the pending action: keep credentials out of `state` if your SessionStore is not a place for them.
	 */
	state?: Record<string, unknown>;
}

export interface RunResult<TOutput = unknown> {
	text: string;
	/** Validated structured output (F6): present when the agent declares `output`. */
	output?: TOutput;
	usage: TokenUsage;
	/** Absent when pricing is not configured or no model used in the run had a price. */
	cost?: RunCost;
	/** Complete run trace: the basis for test assertions. */
	events: AgentEvent[];
	status: "completed" | "pending_approval";
	pending?: PendingApproval[];
	/**
	 * Sources that could not be used because the user has to authorize again. Empty when there were
	 * none. Separate from a failed tool on purpose: nothing is broken and retrying will not help,
	 * this is what an application turns into a "reconnect" button.
	 */
	reauth: ReauthRequest[];
}

export interface ReauthRequest {
	/** The source's `name`, as declared by whoever built it. */
	source: string;
	reason: string;
}

// ---------- session ----------

export interface SessionEvent {
	/** Serialization format version: migration is the core's responsibility. */
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
	/** Content, encoded as `encoding` says. */
	data: string;
	/**
	 * How `data` is encoded. Absent → inferred from `mimeType` (text-like reads as utf8, everything
	 * else as base64), which is what the two producers already do: offload writes JSON as characters,
	 * while an uploaded file arrives as base64. Set it explicitly when the guess would be wrong.
	 */
	encoding?: "utf8" | "base64";
}
