import type { ParsedArguments } from "./parsed-arguments";

/**
 * What a tool accepts, in the two forms it needs to be in.
 *
 * `declaration` is what the model is shown, and `parse` is what the runtime trusts.
 * They are separate methods because they answer to different readers: a provider wants
 * JSON Schema, and the runtime wants a decision about a value that has already arrived.
 *
 * Parsing never throws. Arguments a model wrote badly are ordinary traffic, and the
 * caller decides whether to hand the reason back and let it try again.
 */
export abstract class ToolSchema {
	public abstract declaration(): unknown;

	public abstract parse(args: unknown): ParsedArguments;
}
