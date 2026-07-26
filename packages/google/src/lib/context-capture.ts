import type { LlmRequest } from "@google/adk";
import type { ContextSegment, ContextSnapshot } from "@nestjs-adk/core";

/**
 * Serialization mirrors the payload as-is, INSERTION ORDER INCLUDED. Sorting keys here would be a
 * trap: the provider caches on the bytes it receives, so a request whose keys come out in a
 * different order really does break the cache. Normalizing that away would report a stable prefix
 * for a context that is not stable at all.
 */
function serialize(value: unknown): string {
	return JSON.stringify(value) ?? "";
}

/** systemInstruction accepts a plain string or Content — both collapse to their text. */
function instructionText(instruction: unknown): string {
	if (instruction == null) return "";
	if (typeof instruction === "string") return instruction;
	if (Array.isArray(instruction)) return instruction.map(instructionText).join("");
	const parts = (instruction as { parts?: Array<{ text?: string }> }).parts;
	if (parts) return parts.map((part) => part.text ?? "").join("");
	return serialize(instruction);
}

/**
 * Native LlmRequest → normalized ContextSnapshot, in the order the provider receives it.
 * systemInstruction and tools live under `config`, not at the top of the request.
 */
export function toSnapshot(request: LlmRequest, agent: string): ContextSnapshot {
	const config = request.config as { systemInstruction?: unknown; tools?: unknown } | undefined;

	const segments: ContextSegment[] = [
		{ kind: "systemInstruction", text: instructionText(config?.systemInstruction) },
		{ kind: "toolDeclarations", text: config?.tools ? serialize(config.tools) : "" },
		{ kind: "contents", text: serialize(request.contents ?? []) },
	];

	return { agent, model: request.model, segments };
}
