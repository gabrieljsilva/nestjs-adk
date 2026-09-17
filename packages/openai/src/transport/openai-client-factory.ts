import { Secret } from "@nestjs-adk/core";
import OpenAI from "openai";
import type { OpenAiOptions } from "../model/openai-options";
import type { OpenAiChatClient } from "./openai-chat-client";

/**
 * Builds the official client from the options, and is the only place that imports the SDK.
 *
 * `baseURL` is passed straight through: pointing it at OpenRouter, Ollama, Groq,
 * Together or vLLM is all it takes to reach them, since they speak the same API. The
 * key falls back to `OPENAI_API_KEY`, which is what the SDK does on its own.
 */
export class OpenAiClientFactory {
	public create(options: OpenAiOptions): OpenAiChatClient {
		const apiKey = Secret.fromOption(options.apiKey);
		return new OpenAI({
			apiKey: apiKey?.reveal(),
			baseURL: options.baseURL,
			organization: options.organization,
			defaultHeaders: options.headers,
			timeout: options.timeoutMs,
		});
	}
}
