import type { ToolSchema } from "./json-schema";
import type { AnyZodObject, ModelInput, ToolEffect, WorkflowMode } from "./options";

/**
 * What the engine receives: everything already resolved via DI by the runner,
 * assembled instruction, tools as executable closures (with ToolContext embedded), model.
 */
export interface ResolvedTool {
	name: string;
	description: string;
	/**
	 * Zod for declared (`@Tool`) tools, where it is the dev's contract and validates for real.
	 * JSON Schema, as published, for tools from an external catalog: the server owns that contract,
	 * and translating it to Zod only subtracted information from the model (see `isJsonSchema`).
	 */
	schema: ToolSchema;
	/**
	 * What the tool does to the world. Every tool converges here, declared or external, so approval
	 * policy reads this field and nothing else. Absent means `destructive`: a source that did not
	 * classify its tool gets no benefit of the doubt.
	 */
	effect?: ToolEffect;
	/**
	 * The source's whole declaration, untouched: for MCP, the SDK tool object with annotations and
	 * everything else beyond the input schema. A permissions UI needs it to show what the server
	 * actually said; same principle as `RawRef` on events: nothing is discarded. Display data only,
	 * and untrusted (the server wrote it): never validate, rebuild a tool, or branch on it at
	 * runtime. Absent on declared tools, where the schema IS the original declaration.
	 */
	raw?: unknown;
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
	/** Structured output: the engine applies constrained decoding when possible. */
	outputSchema?: AnyZodObject;
	/** Continuity: the engine performs compaction; offload is the core's job. */
	context?: import("../models/context-policy").ContextPolicy;
}
