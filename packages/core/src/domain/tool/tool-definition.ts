import { ToolDeclaration } from "../model/tool-declaration";
import type { ToolEffect } from "./tool-effect";
import type { ToolHandler } from "./tool-handler";
import type { ToolSchema } from "./tool-schema";

/**
 * One tool as the runtime knows it: what it is called, what it takes, what it does and
 * what runs when it is called.
 *
 * The effect sits next to the handler rather than inside it, because the decision it
 * feeds is taken before the handler runs. A tool that has to execute to find out whether
 * it needed approval has already done the thing approval was about.
 */
export class ToolDefinition {
	public constructor(
		public readonly name: string,
		public readonly description: string,
		public readonly schema: ToolSchema,
		public readonly effect: ToolEffect,
		public readonly handler: ToolHandler,
		/**
		 * A tool the runtime owns rather than one the application declared.
		 *
		 * Two rules follow from that, and both exist because these tools only ever move
		 * content into the context. No approval policy applies to them, so a policy written
		 * for an application's tools cannot leave a model unable to read what it was told to
		 * read; and their results are never offloaded, because taking back out what was just
		 * fetched back in is a loop rather than a saving.
		 */
		public readonly internal: boolean = false,
	) {}

	/** What the model is shown, which never includes the handler or the effect. */
	public toDeclaration(): ToolDeclaration {
		return new ToolDeclaration(this.name, this.description, this.schema.declaration());
	}
}
