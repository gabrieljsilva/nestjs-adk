import {
	AgentDefinition,
	AgentDescription,
	AgentExecutionPolicies,
	type AgentName,
	DeclaredAgent,
	type LlmModel,
	PromptInstructions,
	type ToolDefinition,
} from "@nestjs-adk/core/native";
import { GeminiModel } from "../gemini-model";

/**
 * What every suite that talks to a real provider needs, in one place.
 *
 * These tests exist to prove the runtime against a provider that actually answers, so they
 * are deliberately tiny: the cheapest model, a handful of output tokens, one question with
 * one right answer. A suite that costs real money has to earn every call it makes.
 */
export const CHEAP_MODEL = "gemini-3.5-flash-lite";

/**
 * The model for anything that continues after a tool result.
 *
 * It is the same model now, and the split is kept because it was earned. On the 2.5 line,
 * `flash-lite` answered a plain question reliably and answered **nothing** on the turn
 * after a function response, three out of three. Gemini 3 fixed that and introduced a
 * different rule: a function call comes back with a `thoughtSignature` that has to be sent
 * again, or the next turn is a 400. Two names keep it visible which capability each suite
 * is actually leaning on.
 */
export const TOOL_MODEL = "gemini-3.5-flash-lite";

/** Enough for a sentence or one tool call, and not enough for the model to ramble. */
const MAX_OUTPUT_TOKENS = 256;

/**
 * Thinking off, deliberately.
 *
 * A 2.5 model spends its output budget on thinking before it writes anything, so a small
 * cap plus thinking is a turn that costs money and answers nothing. These questions have
 * one right answer and need no reasoning, and turning it off is most of why the suite is
 * cheap.
 */
const NO_THINKING = { thinkingConfig: { thinkingBudget: 0 } };

export function apiKeyFromEnvironment(): string | undefined {
	try {
		process.loadEnvFile(new URL("../../../../.env", import.meta.url).pathname);
	} catch {
		// no .env file: the process environment is the only source
	}
	return process.env.GEMINI_API_KEY ?? process.env.GOOGLE_GENAI_API_KEY;
}

/** For a question the model answers on its own: the cheapest thing that can answer it. */
export function cheapModel(apiKey: string): LlmModel {
	return new GeminiModel(CHEAP_MODEL, { apiKey, maxOutputTokens: MAX_OUTPUT_TOKENS, temperature: 0 });
}

/** For a run that goes model, tool, model again. Still small, still one right answer. */
export function toolModel(apiKey: string): LlmModel {
	return new GeminiModel(TOOL_MODEL, { apiKey, maxOutputTokens: MAX_OUTPUT_TOKENS, temperature: 0 });
}

export function agentOf(
	name: AgentName,
	instructions: string,
	model: LlmModel,
	tools: readonly ToolDefinition[] = [],
	policies: AgentExecutionPolicies = AgentExecutionPolicies.none(),
): DeclaredAgent {
	const definition = AgentDefinition.of(
		name,
		AgentDescription.from(instructions, name.value),
		model,
		PromptInstructions.from(instructions),
		policies,
		tools,
	);
	return new DeclaredAgent(definition, `${name.value}-provider`);
}
