/**
 * Neutral model I/O contract — SDK-free mirror of what the runner exercises.
 * AdkModel implementations receive a ready-made ModelRequest (composed instruction,
 * history, tool declarations) and yield ModelResponse chunks back to the engine.
 */

export type ModelPart =
	| { text: string }
	| { data: { mimeType: string; base64: string } }
	| { toolCall: { id?: string; name: string; args: Record<string, unknown> } }
	| { toolResult: { id?: string; name: string; result: unknown } };

export interface ModelMessage {
	role: "user" | "assistant";
	parts: ModelPart[];
}

/** Tool available to the model — `parameters` is the JSON Schema of the tool input. */
export interface ToolDeclaration {
	name: string;
	description?: string;
	parameters?: Record<string, unknown>;
}

/** Universal generation parameters — the single source both specs and the neutral contract extend. */
export interface GenerationParams {
	temperature?: number;
	topP?: number;
	topK?: number;
	maxOutputTokens?: number;
	frequencyPenalty?: number;
	presencePenalty?: number;
	/** Generation stops when any of these strings would be produced (the string itself is not emitted). */
	stopSequences?: string[];
}

/** Keys of GenerationParams — engines use it to promote universal fields out of raw configs. */
export const GENERATION_KEYS = [
	"temperature",
	"topP",
	"topK",
	"maxOutputTokens",
	"frequencyPenalty",
	"presencePenalty",
	"stopSequences",
] as const satisfies readonly (keyof GenerationParams)[];

export interface ModelGenerationConfig extends GenerationParams {
	/** Engine/request fields beyond the universal ones, verbatim (e.g. responseSchema, labels). */
	raw?: Record<string, unknown>;
}

export interface ModelUsage {
	promptTokens?: number;
	outputTokens?: number;
	totalTokens?: number;
	cachedTokens?: number;
}

export interface ModelRequest {
	model: string;
	systemInstruction?: string;
	messages: ModelMessage[];
	tools?: ToolDeclaration[];
	config?: ModelGenerationConfig;
}

/**
 * One chunk of a generation. Aggregation contract: every `text` part is a DELTA
 * (the engine appends them); toolCalls accumulate; usage/finishReason — last one wins.
 * A non-streaming implementation simply yields a single chunk with the full text.
 */
export interface ModelResponse {
	parts?: ModelPart[];
	usage?: ModelUsage;
	finishReason?: string;
}

export interface GenerateOptions {
	/** True when the caller wants incremental deltas — yielding everything at once is still valid. */
	stream?: boolean;
	/**
	 * Run abort. Implementations should honor it (stop the upstream provider call);
	 * the engine stops consuming chunks after it fires either way.
	 */
	signal?: AbortSignal;
}
