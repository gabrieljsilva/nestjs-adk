import type { Type } from "@nestjs/common";
import type { ZodObject, ZodRawShape } from "zod";
import type { AdkAgent } from "../abstracts/adk-agent";
import type { AdkModel } from "../abstracts/adk-model";
import type { AdkSkill } from "../abstracts/adk-skill";
import type { AdkTool } from "../abstracts/adk-tool";
import type { SessionStore } from "../abstracts/session-store";

/**
 * String for the active engine, a model spec (Gemini/OpenAiLike; ScriptedModel in tests)
 * or a custom AdkModel, as a provider class (resolved via DI at boot) or an instance.
 */
export type ModelInput = string | Type<AdkModel> | object;

export type AnyZodObject = ZodObject<ZodRawShape>;

export interface AgentOptions {
	name: string;
	description: string;
	model?: ModelInput;
	/**
	 * Instruction: pick ONE of prompt | promptFile:
	 * - string: the literal prompt text;
	 * - Type<AdkPrompt>: builder class (DI + PromptContext), registered as a provider.
	 */
	prompt?: string | Type<import("../prompts/adk-prompt").AdkPrompt>;
	/**
	 * Instruction from a .md file, verbatim (no variables; use an AdkPrompt for that).
	 * Plain path → module prompts.dir; "./" or "../" → relative to THIS agent's file.
	 */
	promptFile?: string;
	tools?: Array<Type<AdkTool<AnyZodObject>> | import("./toolset").ToolsetRef>;
	skills?: Type<AdkSkill>[];
	/** Override of the module's default SessionStore. Resolution: agent > forRoot > InMemorySessionStore. */
	session?: Type<SessionStore>;
	/** Structured output: ZodObject validated in ask(); incompatible with transfer to another agent. */
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
	/**
	 * How many times invalid arguments for the SAME tool are handed back to the model before the run
	 * aborts with ToolInvalidArgsError (a valid call resets that tool's count). Same resolution as
	 * maxIterations, but unset means 2, not unlimited: the model wrote the argument and usually fixes
	 * it on the next try, while a model that cannot satisfy the schema would otherwise loop on your
	 * bill. `0` aborts on the first invalid call.
	 */
	maxInvalidArgs?: number;
}

/**
 * What the tool does to the world, ordered: read < write < destructive.
 * A fact about the tool, declared by its author. What to do about it (pause for approval,
 * hide from the model) is policy, decided per run via `ask({ approval })`.
 * `destructive` means "not recoverable through the same API": deleting, but also sending
 * an email or charging a card. Running arbitrary code is `destructive` by construction.
 */
export type ToolEffect = "read" | "write" | "destructive";

/**
 * Which effects pause for human approval (HITL).
 * "destructive" pauses destructive calls; "write" pauses write and destructive; "none" never pauses.
 * Resolution: ask() > forRoot defaults > "destructive".
 */
export type ApprovalPolicy = "none" | "write" | "destructive";

export interface ToolOptions<S extends AnyZodObject = AnyZodObject> {
	/** Default: the method name (inline); required on a class. */
	name?: string;
	description: string;
	schema: S;
	/** Default: "write". The author had the chance to say "read" and did not say it. */
	effect?: ToolEffect;
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
