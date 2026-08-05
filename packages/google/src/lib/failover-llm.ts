import type { BaseLlm, BaseLlmConnection, LlmRequest, LlmResponse } from "@google/adk";
import { BaseLlm as AdkBaseLlm } from "@google/adk";
import { type FailoverFn, type FailoverTarget, ModelsExhaustedError } from "@nestjs-adk/core";

/** What the engine needs to emit a `model_rerouted` event; the agent name is added by the caller. */
export interface FailoverReroute {
	from: string;
	to: string;
	reason: string;
	toModel?: string;
}

/**
 * A policy that keeps returning targets on every failure would run on the caller's bill forever,
 * so the chain has a hard ceiling, same philosophy as maxInvalidArgs. Ten is far above any sane
 * retry-then-degrade ladder and low enough that a loop dies in seconds.
 */
const MAX_FAILOVER_ATTEMPTS = 10;

export interface FailoverLlmOptions {
	primary: BaseLlm;
	/** The model's failover policy, already normalized (array form included) by `failoverPolicy()`. */
	policy: FailoverFn;
	/** Engine hook: turns whatever the policy returned into a callable model (specs, DI classes, ids). */
	resolveTarget: (target: FailoverTarget) => Promise<BaseLlm>;
	/** Called at the moment the chain advances, so the reroute is observable as it happens. */
	onReroute?: (reroute: FailoverReroute) => void;
}

/**
 * The lib's own failover, executing the `failover` declared on the model spec. This replaces the
 * ADK's `@experimental` RoutedLlm, which delegated the request still naming the ROUTER as its
 * model; Gemini reads `llmRequest.model` before its own, so the router's display name reached the
 * API as a model id and every target failed with the same 400. Here every attempt receives the
 * request naming that attempt's own model, by construction, so the class of bug cannot come back.
 *
 * Semantics, owned by the lib and not by the provider SDK:
 * - The policy is consulted only for failures BEFORE the first chunk. After a chunk, the consumer
 *   already received part of the answer and a retry would replay it: the error propagates.
 * - An aborted request never fails over: the consumer walked away, there is nobody to answer.
 * - The policy returns the next target (the same model is a legitimate retry) or `undefined` to
 *   give up. Giving up, exhausting the ceiling, or a target that cannot be resolved all surface
 *   as `ModelsExhaustedError`, carrying every failure in order.
 * - Each attempt runs with the ORIGINAL request, never one contaminated by the failed attempt.
 */
export class FailoverLlm extends AdkBaseLlm {
	public constructor(private readonly options: FailoverLlmOptions) {
		// Upstream sees the primary's real id: it is the model that serves until a reroute, and what
		// logs and usage should show. Never a display name of the chain itself.
		super({ model: options.primary.model });
	}

	public async *generateContentAsync(
		llmRequest: LlmRequest,
		stream?: boolean,
		abortSignal?: AbortSignal,
	): AsyncGenerator<LlmResponse, void> {
		const failures: Array<{ target: string; error: unknown }> = [];
		let current = this.options.primary;

		while (failures.length < MAX_FAILOVER_ATTEMPTS) {
			let yielded = false;
			try {
				for await (const chunk of current.generateContentAsync(this.pinned(llmRequest, current), stream, abortSignal)) {
					yielded = true;
					yield chunk;
				}
				return;
			} catch (error) {
				if (yielded || abortSignal?.aborted) throw error;

				// meta.failures are the PREVIOUS attempts; the current error is the first argument.
				const decision = await this.options.policy(error, {
					currentModel: current.model,
					failures: failures.map((failure) => ({ model: failure.target, error: failure.error })),
				});
				failures.push({ target: current.model, error });
				if (decision === undefined) throw new ModelsExhaustedError(failures);

				let next: BaseLlm;
				try {
					next = await this.options.resolveTarget(decision);
				} catch (resolveError) {
					// A target the policy named but nobody can build failed exactly like a model would.
					failures.push({ target: String(modelIdish(decision)), error: resolveError });
					throw new ModelsExhaustedError(failures);
				}

				this.options.onReroute?.({
					from: current.model,
					to: next.model,
					reason: reasonOf(error),
					toModel: next.model,
				});
				current = next;
			}
		}

		throw new ModelsExhaustedError(failures);
	}

	/** Live connections do not fail over (there is no request to replay): the primary answers. */
	public connect(llmRequest: LlmRequest): Promise<BaseLlmConnection> {
		return this.options.primary.connect(this.pinned(llmRequest, this.options.primary));
	}

	/** The incoming request is never mutated: the next attempt must see the original. */
	private pinned(llmRequest: LlmRequest, target: BaseLlm): LlmRequest {
		return { ...llmRequest, model: target.model };
	}
}

/**
 * Best effort HTTP status of a provider error, for failover policies. Providers disagree on error
 * shapes, so the raw error stays raw; this reads the places the SDKs the built-in specs use put
 * the status, and answers `undefined` for shapes it does not know, so a policy can degrade with
 * dignity instead of guessing.
 */
export function httpStatusOf(error: unknown): number | undefined {
	if (typeof error !== "object" || error === null) return undefined;
	const candidate = error as { status?: unknown; code?: unknown; response?: { status?: unknown } };
	for (const value of [candidate.status, candidate.response?.status, candidate.code]) {
		if (typeof value === "number" && value >= 100 && value <= 599) return value;
	}
	// The genai SDK sometimes only encodes the status in the message ("got status: 429 ...").
	if (error instanceof Error) {
		const match = error.message.match(/\b([1-5]\d{2})\b/);
		if (match) return Number(match[1]);
	}
	return undefined;
}

function reasonOf(error: unknown): string {
	return error instanceof Error ? error.message : String(error);
}

function modelIdish(target: FailoverTarget): string {
	if (typeof target === "string") return target;
	const candidate = target as { model?: unknown; name?: unknown };
	if (typeof candidate.model === "string") return candidate.model;
	if (typeof candidate.name === "string") return candidate.name;
	return "unknown target";
}
