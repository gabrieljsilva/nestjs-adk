import type { Content, GenerateContentConfig } from "@google/genai";

/**
 * A generate call, already mapped and independent of the transport.
 *
 * The content and config shapes are the SDK's own types: this package depends on the
 * SDK anyway, and borrowing its types means the type checker verifies the mapping
 * instead of an assertion doing it at the last moment.
 */
export class GeminiRequest {
	public constructor(
		public readonly model: string,
		public readonly contents: readonly Content[],
		public readonly config: GenerateContentConfig = {},
	) {}
}
