import type { LlmAgent } from "@google/adk";
import { AdkEngine, AgentRunner } from "@nestjs-adk/core";
import type { Type } from "@nestjs/common";
import { NestFactory } from "@nestjs/core";
import { GoogleAdkEngine } from "./google-adk-engine";

/**
 * Interop with the Google ADK ecosystem:
 * bootstraps the Nest context (DI resolves tools/prompts/config) and returns the NATIVE LlmAgent —
 * consumable by `adk web`/devtools:
 *
 *   // adk-agents/<name>/agent.mjs
 *   export const rootAgent = await createAdkEntry(AppModule, WeatherAgent);
 */
export async function createAdkEntry(rootModule: Type, agentType: Type): Promise<LlmAgent> {
	const app = await NestFactory.createApplicationContext(rootModule, { logger: false });
	await app.init();

	const runner = app.get(AgentRunner);
	const engine = resolveEngine(app);

	const resolved = await runner.resolve(agentType);
	return engine.toNative(resolved);
}

function resolveEngine(app: { get<T>(token: unknown, options?: { strict: boolean }): T }): GoogleAdkEngine {
	try {
		const candidate = app.get<AdkEngine>(AdkEngine, { strict: false });
		if (candidate instanceof GoogleAdkEngine) return candidate;
	} catch {
		// module without a registered AdkEngine — falls back to its own instance
	}
	return new GoogleAdkEngine();
}
