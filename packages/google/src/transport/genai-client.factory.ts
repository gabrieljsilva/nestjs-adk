import { GoogleGenAI } from "@google/genai";
import { Secret } from "@nestjs-adk/core";
import type { GeminiOptions } from "../model/gemini.options";
import type { GenAiClient, GenAiEmbeddingClient } from "./genai-client.contract";

export class GenAiClientFactory {
	public create(options: GeminiOptions): GenAiClient {
		return this.client(options);
	}

	public embeddings(options: GeminiOptions): GenAiEmbeddingClient {
		return this.client(options);
	}

	private client(options: GeminiOptions): GoogleGenAI {
		if (options.vertexai === true) {
			return new GoogleGenAI({ vertexai: true, project: options.project, location: options.location });
		}
		const apiKey = Secret.fromOption(options.apiKey);
		return new GoogleGenAI({ apiKey: apiKey?.reveal() });
	}
}
