import type { AnyZodObject, ModelInput, WorkflowMode } from "./options";

/**
 * What the engine receives: everything already resolved via DI by the runner —
 * assembled instruction, tools as executable closures (with ToolContext embedded), model.
 */
export interface ResolvedTool {
	name: string;
	description: string;
	schema: AnyZodObject;
	/** Per-run closure: executes the real tool (class via DI or inline method) with the ToolContext. */
	execute(input: unknown): Promise<unknown>;
}

export interface ResolvedAgent {
	name: string;
	description: string;
	instruction?: string;
	model?: ModelInput;
	tools: ResolvedTool[];
	subAgents: ResolvedAgent[];
	workflow?: { mode: WorkflowMode; agents: ResolvedAgent[]; maxIterations?: number };
	/** Structured output — the engine applies constrained decoding when possible. */
	outputSchema?: AnyZodObject;
	/** Continuity — the engine performs compaction; offload is the core's job. */
	context?: import("../models/context-policy").ContextPolicy;
}
