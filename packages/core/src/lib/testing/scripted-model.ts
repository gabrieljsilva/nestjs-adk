import type { ScriptTurn } from "./scripted-engine";

/**
 * Test model spec: mock at the MODEL layer, not the engine layer.
 * Pure data — each engine realizes it (e.g.: @nestjs-adk/google creates a fake BaseLlm).
 * The engine's real loop runs (real tools via DI, real sessions); only the LLM is scripted.
 * Each run consumes one script from the queue.
 */
export class ScriptedModel {
	public readonly __adkScriptedModel = true;
	public readonly scripts: ScriptTurn[][];

	public constructor(...scripts: ScriptTurn[][]) {
		this.scripts = [...scripts];
	}

	public enqueue(turns: ScriptTurn[]): this {
		this.scripts.push(turns);
		return this;
	}
}

export function isScriptedModel(model: unknown): model is ScriptedModel {
	return typeof model === "object" && model !== null && "__adkScriptedModel" in model;
}
