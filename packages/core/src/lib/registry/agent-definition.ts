import type { Type } from "@nestjs/common";
import type { AdkSkill } from "../abstracts/adk-skill";
import type { AdkTool } from "../abstracts/adk-tool";
import type { AdkPrompt } from "../prompts/adk-prompt";
import type { AgentOptions, ModelInput, SkillOptions, ToolOptions, WorkflowOptions } from "../types/options";

export type ToolBinding =
	| { kind: "class"; type: Type<AdkTool>; instance: AdkTool; options: ToolOptions }
	| { kind: "inline"; method: string; options: ToolOptions };

export type SkillBinding =
	| { kind: "class"; type: Type<AdkSkill>; instance: AdkSkill; options: Required<SkillOptions> }
	| { kind: "inline"; method: string; options: Required<SkillOptions> };

/** Resolved view of an agent after discovery — what the engine consumes (via ResolvedAgent, F3). */
export class AgentDefinition {
	public constructor(
		public readonly name: string,
		public readonly type: Type,
		public readonly instance: object,
		public readonly options: AgentOptions | undefined,
		public readonly model: ModelInput | undefined,
		public readonly tools: ToolBinding[],
		public readonly skills: SkillBinding[],
		public readonly subAgents: Type[],
		public readonly promptText: string | undefined,
		public readonly promptFile: string | undefined,
		public readonly promptInstance: AdkPrompt | undefined,
		public readonly workflow: WorkflowOptions | undefined,
		public readonly output?: import("../types/options").AnyZodObject,
		public readonly outputKey?: string,
		public readonly toolsets: import("../types/toolset").ToolsetRef[] = [],
	) {}

	public get description(): string {
		return this.options?.description ?? this.workflow?.description ?? "";
	}
}
