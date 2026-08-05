export { createAdkEntry } from "./lib/create-adk-entry";
export { GoogleAdkEngine } from "./lib/google-adk-engine";
export { ScriptedLlm } from "./lib/scripted-llm";
export { httpStatusOf } from "./lib/failover-llm";
export { toGeminiSchema } from "./lib/gemini-schema";

// canonical home for the Gemini model spec (implemented in core as pure data)
export { Gemini } from "@nestjs-adk/core";
export type { GeminiOptions } from "@nestjs-adk/core";
