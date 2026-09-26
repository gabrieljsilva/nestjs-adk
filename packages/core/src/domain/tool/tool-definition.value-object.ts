import { ToolDeclaration } from "../model/messages/tool-declaration.value-object";
import type { ToolEffect } from "./approval/tool-effect.value-object";
import type { ToolHandler } from "./invocation/tool-handler.contract";
import type { ToolSchema } from "./tool-schema.contract";

/** One tool as the runtime knows it: its name, its description, what it accepts, the effect it declares and the code that runs. */
export class ToolDefinition {
	public constructor(
		public readonly name: string,
		public readonly description: string,
		public readonly schema: ToolSchema,
		public readonly effect: ToolEffect,
		public readonly handler: ToolHandler,
	) {}

	public toDeclaration(): ToolDeclaration {
		return new ToolDeclaration(this.name, this.description, this.schema.declaration());
	}
}
