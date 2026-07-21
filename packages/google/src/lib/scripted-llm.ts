import { BaseLlm, type BaseLlmConnection, type LlmRequest, type LlmResponse } from "@google/adk";
import type { ScriptTurn, ScriptedModel } from "@nestjs-adk/core";

/**
 * Google realization of `ScriptedModel`: a fake BaseLlm running INSIDE
 * the ADK's real loop — tool wiring, sessions and processors 100% native; only the LLM is scripted.
 * Each model call consumes ONE turn from the current run's script.
 */
export class ScriptedLlm extends BaseLlm {
	private turns: ScriptTurn[];
	/** Last request received — inspectable in tests (systemInstruction, contents...). */
	public lastRequest?: LlmRequest;
	private callCounter = 0;

	public constructor(
		private readonly spec: ScriptedModel,
		private readonly onRequest?: (request: LlmRequest) => void,
	) {
		super({ model: "scripted" });
		this.turns = this.spec.scripts.shift() ?? [];
	}

	public async *generateContentAsync(llmRequest: LlmRequest): AsyncGenerator<LlmResponse, void> {
		this.lastRequest = llmRequest;
		this.onRequest?.(llmRequest);

		const turn = this.turns.shift() ?? { kind: "text" as const, text: "", usage: zeroUsage() };

		if (turn.kind === "fail") throw new Error(turn.message);

		if (turn.kind === "tool_call") {
			yield {
				content: {
					role: "model",
					parts: [
						{
							functionCall: {
								id: `scripted_call_${++this.callCounter}`,
								name: turn.tool,
								args: turn.args as Record<string, unknown>,
							},
						},
					],
				},
				// Real models report usage on every response, including tool-call turns.
				usageMetadata: { promptTokenCount: 10, candidatesTokenCount: 5, totalTokenCount: 15 },
			};
			return;
		}

		yield {
			content: { role: "model", parts: [{ text: turn.text }] },
			usageMetadata: {
				promptTokenCount: turn.usage.promptTokens,
				candidatesTokenCount: turn.usage.outputTokens,
				totalTokenCount: turn.usage.totalTokens,
			},
		};
	}

	public connect(): Promise<BaseLlmConnection> {
		throw new Error("ScriptedLlm does not support live connections.");
	}
}

function zeroUsage() {
	return { promptTokens: 0, outputTokens: 0, totalTokens: 0 };
}
