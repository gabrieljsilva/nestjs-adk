import type { ToolEffect } from "./approval/tool-effect.value-object";
import { UnboundRuntimeToolError } from "./errors/unbound-runtime-tool.error";
import { ToolHandler } from "./invocation/tool-handler.contract";
import { ToolDefinition } from "./tool-definition.value-object";
import type { ToolSchema } from "./tool-schema.contract";

/**
 * A tool the runtime owns, in the form an agent asks for it: everything the model reads, and
 * nothing that runs. The runtime binds it to its own ports when it builds the catalog for a run,
 * so what the model is shown is declared once and the code behind it is composed once.
 *
 * A request that reaches a model is one no runtime claimed, and it refuses instead of answering.
 */
export class RuntimeToolRequest extends ToolDefinition {
	public constructor(name: string, description: string, schema: ToolSchema, effect: ToolEffect) {
		super(name, description, schema, effect, new UnboundHandler(name));
	}

	public boundTo(handler: ToolHandler): ToolDefinition {
		return new ToolDefinition(this.name, this.description, this.schema, this.effect, handler);
	}
}

class UnboundHandler extends ToolHandler {
	public constructor(private readonly toolName: string) {
		super();
	}

	public async invoke(): Promise<unknown> {
		throw new UnboundRuntimeToolError(this.toolName);
	}
}
