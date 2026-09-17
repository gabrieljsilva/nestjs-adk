import { Secret } from "@nestjs-adk/core";
import OpenAI from "openai";
import type { OpenAiOptions } from "../model/openai.options";
import type { OpenAiChatClient } from "./openai-chat-client.contract";

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
