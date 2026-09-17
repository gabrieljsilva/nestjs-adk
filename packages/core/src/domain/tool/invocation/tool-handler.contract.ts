import type { ToolContext } from "./tool-context.value-object";

/**
 * The code a tool runs, however it was declared. It returns whatever the application returns;
 * turning that into something a model can read is the runtime's job.
 */
export abstract class ToolHandler {
	public abstract invoke(args: Record<string, unknown>, context: ToolContext): Promise<unknown>;
}
