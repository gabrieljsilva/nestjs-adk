import type { Content, GenerateContentConfig } from "@google/genai";

export class GeminiRequest {
	public constructor(
		public readonly model: string,
		public readonly contents: readonly Content[],
		public readonly config: GenerateContentConfig = {},
	) {}
}
