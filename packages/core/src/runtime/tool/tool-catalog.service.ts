import type { ToolDeclaration } from "../../domain/model/messages/tool-declaration.value-object";
import { ToolNotFoundError } from "../../domain/tool/errors/tool-not-found.error";
import type { ToolDefinition } from "../../domain/tool/tool-definition.value-object";

export class ToolCatalog {
	private readonly byName: ReadonlyMap<string, ToolDefinition>;

	public constructor(tools: readonly ToolDefinition[]) {
		this.byName = new Map(tools.map((tool) => [tool.name, tool]));
		Object.freeze(this);
	}

	public static empty(): ToolCatalog {
		return new ToolCatalog([]);
	}

	public get names(): readonly string[] {
		return [...this.byName.keys()];
	}

	public get size(): number {
		return this.byName.size;
	}

	public get isEmpty(): boolean {
		return this.byName.size === 0;
	}

	public has(name: string): boolean {
		return this.byName.has(name);
	}

	public find(name: string): ToolDefinition | undefined {
		return this.byName.get(name);
	}

	public findOrFail(name: string): ToolDefinition {
		const tool = this.byName.get(name);
		if (tool === undefined) throw new ToolNotFoundError(name, this.names);
		return tool;
	}

	public declarations(): readonly ToolDeclaration[] {
		return [...this.byName.values()].map((tool) => tool.toDeclaration());
	}
}
