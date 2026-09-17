import type { ToolDefinition } from "../../domain/tool/tool-definition.value-object";
import { UnregisteredToolError } from "./errors/unregistered-tool.error";

/**
 * Resolves what an agent or a controller wrote in `tools` against the tools the container
 * declared.
 *
 * An entry is the class, which is what a module has at hand when the tool lives beside it, or
 * the name the tool declared, for when importing the class would tie two modules together in a
 * cycle the decorator evaluates on load. Both answer the same definition: the lookup is by the
 * token the tool was registered under, or by the name that token's definition carries, and
 * nothing is built twice. What does not answer is refused at boot, naming what was found, since
 * a tool that silently leaves the catalog only shows up as a bad answer.
 */
export class SharedToolLookup {
	public constructor(private readonly shared: ReadonlyMap<unknown, ToolDefinition>) {}

	public resolve(entry: unknown, providerName: string): ToolDefinition {
		const tool = this.shared.get(entry) ?? this.byName(entry);
		if (tool === undefined) {
			throw new UnregisteredToolError(providerName, this.nameOf(entry), this.registeredNames());
		}
		return tool;
	}

	public resolveAll(entries: readonly unknown[], providerName: string): readonly ToolDefinition[] {
		return entries.map((entry) => this.resolve(entry, providerName));
	}

	private byName(entry: unknown): ToolDefinition | undefined {
		if (typeof entry !== "string") return undefined;
		return [...this.shared.values()].find((tool) => tool.name === entry);
	}

	private registeredNames(): readonly string[] {
		return [...this.shared.values()].map((tool) => tool.name);
	}

	/** A class is named by its own name, and anything else by what it prints as. */
	private nameOf(entry: unknown): string {
		const declared = typeof entry === "function" ? Reflect.get(entry, "name") : undefined;
		return typeof declared === "string" && declared.length > 0 ? declared : String(entry);
	}
}
