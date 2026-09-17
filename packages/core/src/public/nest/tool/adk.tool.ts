import type { ZodType, z } from "zod";
import type { ToolContext } from "../../../domain/tool/invocation/tool-context.value-object";

/**
 * A tool an application writes as a class of its own, over the schema `@Tool` declared. What
 * `execute` answers goes back to the model, and a promise is awaited first.
 *
 * `input` is what the model decided, already parsed, so keys outside the schema are gone.
 * `context` is what the run knows: the session, the call and the signal. Anything the model
 * must not choose, a tenant id being the usual one, belongs in the second.
 */
export abstract class AdkTool<TSchema extends ZodType = ZodType> {
	public abstract execute(input: z.infer<TSchema>, context: ToolContext): unknown;
}
