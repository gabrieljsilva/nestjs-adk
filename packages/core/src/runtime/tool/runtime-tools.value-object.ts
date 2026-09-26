import { RuntimeToolRequest } from "../../domain/tool/runtime-tool-request.value-object";
import type { ToolDefinition } from "../../domain/tool/tool-definition.value-object";

export class RuntimeTools {
	public constructor(
		private readonly always: readonly ToolDefinition[] = [],
		private readonly onRequest: readonly ToolDefinition[] = [],
	) {}

	public static none(): RuntimeTools {
		return new RuntimeTools();
	}

	public bind(declared: readonly ToolDefinition[]): readonly ToolDefinition[] {
		const asked = new Set(declared.filter((tool) => tool instanceof RuntimeToolRequest).map((tool) => tool.name));
		return [...this.always, ...this.onRequest.filter((tool) => asked.has(tool.name))];
	}
}
