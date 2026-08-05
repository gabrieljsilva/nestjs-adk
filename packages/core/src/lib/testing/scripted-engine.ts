import { randomUUID } from "node:crypto";
import { Injectable } from "@nestjs/common";
import { AdkEngine } from "../abstracts/adk-engine";
import { modelIdOf } from "../models/model-specs";
import type { AgentEvent, RunInput, TokenUsage } from "../types/events";
import type { ResolvedAgent } from "../types/resolved-agent";

export type ScriptTurn =
	| { kind: "tool_call"; tool: string; args: unknown }
	| { kind: "text"; text: string; usage: TokenUsage }
	| { kind: "deltas"; chunks: string[]; usage: TokenUsage }
	| { kind: "fail"; message: string };

/** Tool turn: the engine executes the REAL resolved tool (DI) and follows the script. */
export function callTool(tool: string, args: unknown): ScriptTurn {
	return { kind: "tool_call", tool, args };
}

/** "Model" failure turn (e.g.: simulating a 429): the target throws before the 1st chunk. */
export function fail(message: string): ScriptTurn {
	return { kind: "fail", message };
}

/**
 * Streamed "model" turn: one partial `llm_response` per chunk, then the aggregated response the
 * provider also sends at the end of the turn.
 *
 * Both halves matter. A consumer that appends every `llm_response` would print the answer twice,
 * and one that ignores the aggregated response shows nothing when streaming is off or the provider
 * falls back: neither bug is reachable against a test engine that emits only one of the two.
 */
export function deltas(chunks: string[], usage?: Partial<TokenUsage>): ScriptTurn {
	return {
		kind: "deltas",
		chunks,
		usage: {
			promptTokens: usage?.promptTokens ?? 10,
			outputTokens: usage?.outputTokens ?? 5,
			totalTokens: usage?.totalTokens ?? 15,
		},
	};
}

/** "Model" response turn. */
export function text(value: string, usage?: Partial<TokenUsage>): ScriptTurn {
	return {
		kind: "text",
		text: value,
		usage: {
			promptTokens: usage?.promptTokens ?? 10,
			outputTokens: usage?.outputTokens ?? 5,
			totalTokens: usage?.totalTokens ?? 15,
		},
	};
}

/**
 * Scriptable fake engine (embryo of @nestjs-adk/testing, F5).
 * Consumes turn scripts per run: executes the ResolvedAgent's real tools
 * (proving the DI wiring) and emits the normalized loop of AgentEvents.
 */
@Injectable()
export class ScriptedEngine extends AdkEngine {
	private readonly scripts: ScriptTurn[][] = [];
	/** Draft of the NEXT run (stacked via push), consumed whole by whoever triggers the run. */
	private readonly draft: ScriptTurn[] = [];
	/** Last resolved agent: inspectable in tests (instruction, tools...). */
	public lastAgent?: ResolvedAgent;
	public lastInput?: RunInput;

	public enqueue(turns: ScriptTurn[]): void {
		this.scripts.push(turns);
	}

	/** Stacks a turn onto the next run's draft (TestAgent.mock* API); nothing executes here. */
	public push(turn: ScriptTurn): void {
		this.draft.push(turn);
	}

	public async *run(agent: ResolvedAgent, input: RunInput): AsyncGenerator<AgentEvent> {
		this.lastAgent = agent;
		this.lastInput = input;
		const turns = this.draft.length > 0 ? this.draft.splice(0) : (this.scripts.shift() ?? [text("")]);

		yield { type: "run_start", agent: agent.name, sessionId: input.sessionId };

		const total: TokenUsage = { promptTokens: 0, outputTokens: 0, totalTokens: 0 };
		let finalText = "";

		for (const turn of turns) {
			if (turn.kind === "fail") throw new Error(turn.message);
			if (turn.kind === "tool_call") {
				const tool = agent.tools.find((candidate) => candidate.name === turn.tool);
				if (!tool) throw new Error(`ScriptedEngine: tool "${turn.tool}" not found on agent "${agent.name}".`);
				const callId = randomUUID();
				yield { type: "tool_call", agent: agent.name, callId, tool: turn.tool, args: turn.args };
				const result = await tool.execute(turn.args);
				yield { type: "tool_result", agent: agent.name, callId, tool: turn.tool, result };
				continue;
			}

			total.promptTokens += turn.usage.promptTokens;
			total.outputTokens += turn.usage.outputTokens;
			total.totalTokens += turn.usage.totalTokens;
			const model = modelIdOf(agent.model);

			if (turn.kind === "deltas") {
				for (const chunk of turn.chunks) {
					// no usage on a delta: the tokens are counted once, on the aggregated response below
					yield { type: "llm_response", agent: agent.name, model, text: chunk, partial: true };
				}
				finalText = turn.chunks.join("");
				yield { type: "llm_response", agent: agent.name, model, text: finalText, usage: turn.usage };
				continue;
			}

			finalText = turn.text;
			yield { type: "llm_response", agent: agent.name, model, text: turn.text, usage: turn.usage };
		}

		yield { type: "final", agent: agent.name, text: finalText, usage: total };
	}
}
