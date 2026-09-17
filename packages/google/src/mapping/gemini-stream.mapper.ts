import { ModelChunk, ModelUsage, ToolCallDelta } from "@nestjs-adk/core";

export interface GeminiResponseChunk {
	candidates?: Array<{
		content?: {
			parts?: Array<{
				text?: string;
				functionCall?: { id?: string; name?: string; args?: Record<string, unknown> };
				thoughtSignature?: string;
			}>;
		};
		finishReason?: string;
	}>;
	usageMetadata?: {
		promptTokenCount?: number;
		candidatesTokenCount?: number;
		cachedContentTokenCount?: number;
	};
}

export class GeminiStreamMapper {
	public toChunks(raw: GeminiResponseChunk, firstCallIndex = 0): ModelChunk[] {
		const chunks: ModelChunk[] = [];
		const candidate = raw.candidates?.[0];
		let callIndex = firstCallIndex;

		for (const part of candidate?.content?.parts ?? []) {
			if (typeof part.text === "string" && part.text.length > 0) chunks.push(ModelChunk.text(part.text));
			const call = part.functionCall;
			if (call === undefined) continue;
			chunks.push(
				ModelChunk.toolCall(
					new ToolCallDelta(callIndex, JSON.stringify(call.args ?? {}), call.id, call.name, part.thoughtSignature),
				),
			);
			callIndex += 1;
		}

		const usage = raw.usageMetadata;
		if (usage !== undefined) {
			chunks.push(
				ModelChunk.usage(
					ModelUsage.fromReport(
						usage.promptTokenCount ?? 0,
						usage.candidatesTokenCount ?? 0,
						usage.cachedContentTokenCount ?? 0,
					),
				),
			);
		}

		const finish = candidate?.finishReason;
		if (typeof finish === "string" && finish.length > 0) chunks.push(ModelChunk.finish(finish));

		return chunks;
	}
}
