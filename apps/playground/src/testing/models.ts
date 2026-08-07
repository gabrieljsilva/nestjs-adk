import { GeminiEmbedder, GeminiModel } from "@nestjs-adk/google";
import { OpenAiModel } from "@nestjs-adk/openai";
import { LlmJudge } from "@nestjs-adk/testing";

const maxOutputTokens = 256;
const geminiApiKey = process.env.GEMINI_API_KEY;
const openAIApiKey = process.env.OPEN_AI_API_KEY;

if (geminiApiKey === undefined) throw new Error("GEMINI_API_KEY is required");
if (openAIApiKey === undefined) throw new Error("OPEN_AI_API_KEY is required");

export const geminiFlashLite = new GeminiModel("gemini-3.5-flash-lite", {
	apiKey: geminiApiKey,
	maxOutputTokens,
	temperature: 0,
	config: { thinkingConfig: { thinkingLevel: "low" } },
});

export const openAILuna = new OpenAiModel("gpt-5.6-luna", {
	apiKey: openAIApiKey,
	maxOutputTokens,
	body: { reasoning_effort: "none" },
});

export const geminiEmbedder = new GeminiEmbedder("gemini-embedding-2", {
	apiKey: geminiApiKey,
});

export const judge = new LlmJudge(openAILuna);
