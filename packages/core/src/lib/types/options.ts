import type { Type } from "@nestjs/common";
import type { ZodObject, ZodRawShape } from "zod";
import type { AdkAgent } from "../abstracts/adk-agent";
import type { AdkModel } from "../abstracts/adk-model";
import type { AdkSkill } from "../abstracts/adk-skill";
import type { AdkTool } from "../abstracts/adk-tool";
import type { SessionStore } from "../abstracts/session-store";
import type { ToolContext } from "./tool-context";

/**
 * String for the active engine, a model spec (Gemini/OpenAiLike/ModelRouter; ScriptedModel in tests)
 * or a custom AdkModel — as a provider class (resolved via DI at boot) or an instance.
 */
export type ModelInput = string | Type<AdkModel> | object;

export type AnyZodObject = ZodObject<ZodRawShape>;

export interface AgentOptions {
	name: string;
	description: string;
	model?: ModelInput;
	/**
	 * Instruction — pick ONE of prompt | promptFile:
	 * - string: the literal prompt text;
	 * - Type<AdkPrompt>: builder class (DI + PromptContext), registered as a provider.
	 */
	prompt?: string | Type<import("../prompts/adk-prompt").AdkPrompt>;
	/**
	 * Instruction from a .md file, verbatim (no variables — use an AdkPrompt for that).
	 * Plain path → module prompts.dir; "./" or "../" → relative to THIS agent's file.
	 */
	promptFile?: string;
	tools?: Array<Type<AdkTool<AnyZodObject>> | import("./toolset").ToolsetRef>;
	skills?: Type<AdkSkill>[];
	subAgents?: Type<AdkAgent>[];
	/** Override of the module's default SessionStore. Resolution: agent > forRoot > InMemorySessionStore. */
	session?: Type<SessionStore>;
	/** Structured output: ZodObject validated in ask(); incompatible with transfer to subAgents. */
	output?: ZodObject<ZodRawShape>;
	/** Writes the validated output into the session state (pipeline glue). */
	outputKey?: string;
	/** Continuity: this agent's compaction/offload. Overrides the module default. */
	context?: import("../models/context-policy").ContextPolicy;
	/**
	 * Session-state schema: validated at run entry (ask() + store hydration, before any model call)
	 * and on every write to a declared key (ctx.state.set / outputKey). Undeclared keys pass through.
	 */
	state?: AnyZodObject;
	/**
	 * Cap of model↔tools round-trips (tool-call batches) per run. Exceeding it aborts with
	 * AgentMaxIterationsError. Resolution: ask() > agent > forRoot defaults; unset = unlimited.
	 */
	maxIterations?: number;
	/**
	 * Consecutive failures of the SAME tool that abort the run with ToolRepeatedFailureError
	 * (a success resets that tool's count). Same resolution as maxIterations; unset = unlimited.
	 */
	maxConsecutiveToolFailures?: number;
}

export interface ToolOptions<S extends AnyZodObject = AnyZodObject> {
	/** Default: the method name (inline) — required on a class. */
	name?: string;
	description: string;
	schema: S;
	/** HITL: boolean or predicate with the tool class's `this` (DI available). */
	requiresApproval?: boolean | ((input: unknown, ctx: ToolContext) => boolean | Promise<boolean>);
	/** Opt-out of automatic offload for large results. */
	offload?: boolean;
}

export type SkillMode = "on-demand" | "always";

export interface SkillOptions {
	name: string;
	description: string;
	mode?: SkillMode;
}

export type WorkflowMode = "sequential" | "parallel" | "loop";

export interface WorkflowOptions {
	name: string;
	description?: string;
	mode: WorkflowMode;
	agents: Type<AdkAgent | object>[];
	maxIterations?: number;
}
