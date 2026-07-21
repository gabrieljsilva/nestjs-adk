import { Inject, type Type } from "@nestjs/common";
import { ADK_RUNNER } from "../constants";
import type { AgentRunner } from "../runner/agent-runner";
import type { AgentEvent, RunInput, RunResult } from "../types/events";

/**
 * Base contract for every agent declared with @Agent().
 * The instance is the execution handle: inject the agent class anywhere (plain Nest DI)
 * and call ask/stream/approve/reject. The runner arrives via property injection, so the
 * subclass constructor stays free for the user's own dependencies.
 * The TOutput generic is used by structured output (F6) to type ask() end to end.
 */
export abstract class AdkAgent<TOutput = unknown> {
	/** Type marker for output inference — never assigned at runtime. */
	declare readonly __adkOutput?: TOutput;

	@Inject(ADK_RUNNER)
	private readonly adkRunner!: AgentRunner;

	/** Aggregates final text + usage + trace; AiEmptyResponseError on an empty response. */
	public ask(input: RunInput): Promise<RunResult<TOutput>> {
		return this.adkRunner.ask<TOutput>(this.constructor as Type, input);
	}

	/** Normalized event loop (streaming). */
	public stream(input: RunInput): AsyncGenerator<AgentEvent> {
		return this.adkRunner.run(this.constructor as Type, input);
	}

	/** HITL: approves a pending action — executes the tool and resumes the agent. */
	public approve(params: { sessionId: string; callId: string; message?: string }): Promise<RunResult> {
		return this.adkRunner.approve(this.constructor as Type, params);
	}

	/** HITL: rejects a pending action — does NOT execute it and informs the agent. */
	public reject(params: { sessionId: string; callId: string; reason?: string }): Promise<RunResult> {
		return this.adkRunner.reject(this.constructor as Type, params);
	}
}
