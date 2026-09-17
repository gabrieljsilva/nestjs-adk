import type { ToolDefinition } from "../../../domain/tool/tool-definition.value-object";
import { DuplicateExposedToolError } from "../errors/duplicate-exposed-tool.error";
import { NestToolFactory } from "../factory/nest-tool.factory";
import { McpControllerMetadata } from "../metadata/mcp-controller-metadata.value-object";
import { INLINE_TOOLS_METADATA, MCP_CONTROLLER_METADATA } from "../metadata/metadata-keys.token";
import { SharedToolLookup } from "../shared-tool-lookup.service";
import type { ScannedProvider } from "./scanned-provider.value-object";

/**
 * Reads every `@McpController` out of the container and answers the tools they publish.
 *
 * A controller lists shared `@Tool` classes and declares `@Tool` methods of its own, exactly as
 * an agent does, and the two forms are built by the same factory the agents use: a class listed
 * by both an agent and a controller is one provider and one definition. What differs is the
 * check at the end. An agent's catalog is its own, but an MCP server has one flat list, so a
 * name published twice fails the boot naming both providers rather than letting the second
 * quietly replace the first.
 */
export class NestControllerScanner {
	public constructor(private readonly tools: NestToolFactory = new NestToolFactory()) {}

	public scan(providers: readonly ScannedProvider[], shared: ReadonlyMap<unknown, ToolDefinition>): ToolDefinition[] {
		const published = new Map<string, { tool: ToolDefinition; providerName: string }>();
		for (const provider of providers) {
			const metadata: unknown = Reflect.getMetadata(MCP_CONTROLLER_METADATA, provider.type);
			if (metadata === undefined) continue;
			for (const tool of this.toolsOf(provider, metadata, shared)) {
				const clash = published.get(tool.name);
				if (clash !== undefined) throw new DuplicateExposedToolError(tool.name, clash.providerName, provider.name);
				published.set(tool.name, { tool, providerName: provider.name });
			}
		}
		return [...published.values()].map((entry) => entry.tool);
	}

	private toolsOf(
		provider: ScannedProvider,
		metadata: unknown,
		shared: ReadonlyMap<unknown, ToolDefinition>,
	): readonly ToolDefinition[] {
		const declared = McpControllerMetadata.from(metadata, provider.name);
		return [...this.listedTools(declared, shared, provider.name), ...this.ownTools(provider)];
	}

	private listedTools(
		declared: McpControllerMetadata,
		shared: ReadonlyMap<unknown, ToolDefinition>,
		providerName: string,
	): readonly ToolDefinition[] {
		return new SharedToolLookup(shared).resolveAll(declared.tools, providerName);
	}

	private ownTools(provider: ScannedProvider): readonly ToolDefinition[] {
		const inline: unknown = Reflect.getMetadata(INLINE_TOOLS_METADATA, provider.type);
		if (!Array.isArray(inline)) return [];
		return inline.map((entry) =>
			this.tools.fromMethod(
				provider.instance,
				String(Reflect.get(Object(entry), "method")),
				Reflect.get(Object(entry), "options"),
				provider.name,
			),
		);
	}
}
