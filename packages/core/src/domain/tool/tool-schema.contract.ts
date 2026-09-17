import type { ParsedArguments } from "./invocation/parsed-arguments.value-object";

/**
 * What a tool accepts, in the two forms it is needed in: `declaration` is what the model is shown,
 * `parse` is what the runtime trusts. `parse` never throws; badly written arguments are an ordinary outcome.
 */
export abstract class ToolSchema {
	public abstract declaration(): unknown;

	public abstract parse(args: unknown): ParsedArguments;
}
