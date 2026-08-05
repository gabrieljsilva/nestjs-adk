import { Inject, type Type } from "@nestjs/common";
import { ADK_RUNNER } from "../constants";
import type { AgentRunner } from "../runner/agent-runner";
import type { AgentEvent, RunInput, RunResult } from "../types/events";
import type { AdkToolSource } from "./adk-tool-source";

export interface ApproveParams {
	sessionId: string;
	callId: string;
	message?: string;
	/**
	 * A paused tool that came from a source (MCP) needs the sources here again, the same way ask()
	 * received them: the lib keeps no credentials and the original connection is closed.
	 */
	sources?: AdkToolSource[];
}

export interface RejectParams {
	sessionId: string;
	callId: string;
	reason?: string;
}

/**
 * The streaming face of the execution handle: same three verbs, delivered as the normalized event
 * loop instead of an aggregated RunResult. One axis (what to do) times one axis (how to receive
 * it), so a new verb costs one entry here instead of a second method on the class.
 */
export interface AgentStream {
	/** The run, event by event. */
	ask(input: RunInput): AsyncGenerator<AgentEvent>;
	/**
	 * HITL: executes the approved call, then the resumed turn, event by event. The FIRST event is a
	 * `tool_result` carrying the original callId and the executed tool's result, in band: it is what
	 * lets a UI replace its "awaiting approval" row instead of showing it forever.
	 */
	approve(params: ApproveParams): AsyncGenerator<AgentEvent>;
	/** HITL: does NOT execute the pending call; the informed agent's turn arrives event by event. */
	reject(params: RejectParams): AsyncGenerator<AgentEvent>;
}

/**
 * Base contract for every agent declared with @Agent().
 * The instance is the execution handle: inject the agent class anywhere (plain Nest DI) and call
 * `ask`/`approve`/`reject` for aggregated results, or the same verbs under `stream` for the event
 * loop. The runner arrives via property injection, so the subclass constructor stays free for the
 * user's own dependencies.
 * The TOutput generic is used by structured output (F6) to type ask() end to end.
 */
export abstract class AdkAgent<TOutput = unknown> {
	/** Type marker for output inference, never assigned at runtime. */
	declare readonly __adkOutput?: TOutput;

	@Inject(ADK_RUNNER)
	private readonly adkRunner!: AgentRunner;

	/** Aggregates final text + usage + trace; AiEmptyResponseError on an empty response. */
	public ask(input: RunInput): Promise<RunResult<TOutput>> {
		return this.adkRunner.ask<TOutput>(this.constructor as Type, input);
	}

	/**
	 * HITL: approves a pending action, executes the tool and resumes the agent. The `tool_result`
	 * of the approved call is in `events`, under its original callId.
	 */
	public approve(params: ApproveParams): Promise<RunResult> {
		return this.adkRunner.approve(this.constructor as Type, params);
	}

	/** HITL: rejects a pending action, does NOT execute it and informs the agent. */
	public reject(params: RejectParams): Promise<RunResult> {
		return this.adkRunner.reject(this.constructor as Type, params);
	}

	/** The same verbs, streaming: `agent.stream.ask(...)`, `agent.stream.approve(...)`. */
	public get stream(): AgentStream {
		const type = this.constructor as Type;
		const runner = this.adkRunner;
		return {
			ask: (input) => runner.run(type, input),
			approve: (params) => runner.approveStream(type, params),
			reject: (params) => runner.rejectStream(type, params),
		};
	}
}
