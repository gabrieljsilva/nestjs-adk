import type { z } from "zod";
import type { AnyZodObject } from "../types/options";
import type { ToolContext } from "../types/tool-context";

/**
 * Contract for a shared tool (class decorated with @Tool()).
 * The input is inferred from the Zod schema declared in the decorator.
 */
export abstract class AdkTool<S extends AnyZodObject = AnyZodObject> {
	public abstract execute(input: z.infer<S>, ctx?: ToolContext): unknown | Promise<unknown>;
}
