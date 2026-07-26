export { TestAgent } from "./test-agent";
export { engineJudge, expectJudged } from "./judge";
export type { JudgeFn, JudgeVerdict } from "./judge";

// scripting primitives (implemented in core — engines depend on the scripted-model marker)
export { ScriptedEngine, ScriptedModel, callTool, fail, isScriptedModel, text } from "@nestjs-adk/core";
export type { ScriptTurn } from "@nestjs-adk/core";

// context diagnostics (implemented in core — the matchers are a thin shell over these)
export { ContextCollector, cacheHitRatio, comparePrefix } from "@nestjs-adk/core";
export type {
	CacheReport,
	ContextSegment,
	ContextSegmentKind,
	ContextSnapshot,
	PrefixDivergence,
	PrefixReport,
} from "@nestjs-adk/core";
