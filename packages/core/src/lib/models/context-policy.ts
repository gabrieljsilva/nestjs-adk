import type { ModelInput } from "../types/options";

/** Compaction policy, carried out by the engine's native contextCompactors. */
export interface CompactionPolicy {
	/** Triggers compaction when exceeded (prompt tokens). */
	maxTokens: number;
	/** Hysteresis: post-compaction target (when the engine supports it). */
	targetTokens?: number;
	/** Tail of events preserved intact. */
	keepRecent?: number;
	/** Summarizer model. Default: the agent's own model. */
	summarizer?: ModelInput;
}

export interface ContextPolicy {
	readonly __adkContextPolicy: true;
	compaction?: CompactionPolicy;
	/** Offload of large tool results. Global default: automatic with a 20_000 char threshold. `false` disables it. */
	offload?: { threshold?: number } | false;
}

export function contextPolicy(options: Omit<ContextPolicy, "__adkContextPolicy">): ContextPolicy {
	return { __adkContextPolicy: true, ...options };
}

export const DEFAULT_OFFLOAD_THRESHOLD = 20_000;
