import { RuntimeToolRequest } from "../../domain/tool/runtime-tool-request.value-object";
import type { ToolDefinition } from "../../domain/tool/tool-definition.value-object";
import { UnregisteredToolError } from "./errors/unregistered-tool.error";

export class SharedToolLookup {
	public constructor(private readonly shared: ReadonlyMap<unknown, ToolDefinition>) {}

	public resolve(entry: unknown, providerName: string): ToolDefinition {
		const tool = this.shared.get(entry) ?? this.asRuntimeTool(entry) ?? this.byName(entry);
		if (tool === undefined) {
			throw new UnregisteredToolError(providerName, this.readName(entry), this.registeredNames());
		}
		return tool;
	}

	public resolveAll(entries: readonly unknown[], providerName: string): readonly ToolDefinition[] {
		return entries.map((entry) => this.resolve(entry, providerName));
	}

	private asRuntimeTool(entry: unknown): ToolDefinition | undefined {
		if (typeof entry !== "function") return undefined;
		const request = Reflect.get(entry, "request");
		if (typeof request !== "function") return undefined;
		const asked: unknown = Reflect.apply(request, entry, []);
		return asked instanceof RuntimeToolRequest ? asked : undefined;
	}

	private byName(entry: unknown): ToolDefinition | undefined {
		if (typeof entry !== "string") return undefined;
		return [...this.shared.values()].find((tool) => tool.name === entry);
	}

	private registeredNames(): readonly string[] {
		return [...this.shared.values()].map((tool) => tool.name);
	}

	private readName(entry: unknown): string {
		const declared = typeof entry === "function" ? Reflect.get(entry, "name") : undefined;
		return typeof declared === "string" && declared.length > 0 ? declared : String(entry);
	}
}
