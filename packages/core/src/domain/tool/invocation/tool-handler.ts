import type { ToolContext } from "./tool-context";

/**
 * The code a tool runs, wherever it was written.
 *
 * The runtime knows nothing about how it was declared: a method on a NestJS provider, a
 * remote call over MCP and a closure in a test all arrive here as the same shape. What
 * it returns is whatever the application returns, and turning that into something a
 * model can read is the executor's job rather than the author's.
 */
export abstract class ToolHandler {
	public abstract invoke(args: Record<string, unknown>, context: ToolContext): Promise<unknown>;
}
