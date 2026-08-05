import {
	AgentDefinition,
	AgentDescription,
	AgentExecutionPolicies,
	type AgentName,
	Clock,
	DeclaredAgent,
	IdGenerator,
	Instant,
	type LlmModel,
	PromptInstructions,
	type ToolDefinition,
} from "@nestjs-adk/core";
import { OpenAiModel } from "../openai-model";

/**
 * What the OpenAI suite needs to talk to a provider that actually answers.
 *
 * The cheapest model that still sees images, a handful of output tokens and one question
 * with one right answer. A suite that costs real money has to earn every call it makes.
 */
export const CHEAP_MODEL = "gpt-5.6-luna";

/** Enough for a sentence, and not enough for the model to ramble. */
const MAX_OUTPUT_TOKENS = 256;

export function apiKeyFromEnvironment(): string | undefined {
	try {
		process.loadEnvFile(new URL("../../../../.env", import.meta.url).pathname);
	} catch {
		// no .env file: the process environment is the only source
	}
	return process.env.OPEN_AI_API_KEY ?? process.env.OPENAI_API_KEY;
}

export function cheapModel(apiKey: string): LlmModel {
	return new OpenAiModel(CHEAP_MODEL, { apiKey, maxOutputTokens: MAX_OUTPUT_TOKENS });
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

export class SystemClock extends Clock {
	public now(): Instant {
		return Instant.fromEpochMillis(Date.now());
	}
}

export class RandomIdGenerator extends IdGenerator {
	public next(): string {
		return crypto.randomUUID();
	}
}
