import type { ToolDeclaration } from "../../domain/model/tool-declaration";
import { ToolNotFoundError } from "../../domain/tool/errors/tool-not-found.error";
import type { ToolDefinition } from "../../domain/tool/tool-definition";

/**
 * The tools one agent offers, resolved once and read only after.
 *
 * Like the agent catalog, it cannot change: two turns of the same run seeing different
 * tools would let a model call something that was there when it decided and gone when
 * it asked. Order is the order they were declared, which is what the model reads.
 */
export class ToolCatalog {
	private readonly byName: ReadonlyMap<string, ToolDefinition>;

	private constructor(tools: readonly ToolDefinition[]) {
		this.byName = new Map(tools.map((tool) => [tool.name, tool]));
		Object.freeze(this);
	}

	public static of(tools: readonly ToolDefinition[]): ToolCatalog {
		return new ToolCatalog(tools);
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

	/** What the model is shown, in the order the agent declared. */
	public declarations(): readonly ToolDeclaration[] {
		return [...this.byName.values()].map((tool) => tool.toDeclaration());
	}
}
