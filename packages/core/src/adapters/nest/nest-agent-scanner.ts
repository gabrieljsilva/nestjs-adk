import type { LlmModel } from "../../domain/model/llm-model";
import { PromptInstructions } from "../../domain/prompt/prompt-instructions";
import type { SkillDefinition } from "../../domain/skill/skill-definition";
import type { ToolDefinition } from "../../domain/tool/tool-definition";
import {
	AGENT_METADATA,
	DELEGATES_TO_METADATA,
	INLINE_SKILLS_METADATA,
	INLINE_TOOLS_METADATA,
	TOOL_METADATA,
	TRANSFERS_TO_METADATA,
} from "./metadata-keys";
import type { DiscoveredProvider } from "./nest-component-discovery";
import { NestSkillFactory } from "./nest-skill-factory";
import { NestToolFactory } from "./nest-tool-factory";
import { ScannedProvider } from "./scanned-provider";

/**
 * Reads what the decorators wrote and hands back what discovery consumes.
 *
 * NestJS has already built everything by the time this runs, so nothing here constructs or
 * resolves: it walks instances it was given, reads their metadata, and turns the pieces
 * into definitions. Shared tools are matched to the agents that listed them, and tools and
 * skills declared on the agent itself are read off the agent.
 */
export class NestAgentScanner {
	public constructor(
		private readonly tools: NestToolFactory = new NestToolFactory(),
		private readonly skills: NestSkillFactory = new NestSkillFactory(),
	) {}

	public scan(providers: readonly ScannedProvider[], defaultModel: LlmModel): DiscoveredProvider[] {
		const shared = this.sharedTools(providers);
		return providers
			.filter((provider) => Reflect.getMetadata(AGENT_METADATA, provider.type) !== undefined)
			.map((provider) => this.toDiscovered(provider, shared, defaultModel));
	}

	/** Tools with a provider of their own, keyed by the class an agent lists in `tools`. */
	private sharedTools(providers: readonly ScannedProvider[]): Map<unknown, ToolDefinition> {
		const tools = new Map<unknown, ToolDefinition>();
		for (const provider of providers) {
			const metadata = Reflect.getMetadata(TOOL_METADATA, provider.type);
			if (metadata === undefined) continue;
			tools.set(provider.type, this.tools.fromProvider(provider.instance, metadata, provider.name));
		}
		return tools;
	}

	private toDiscovered(
		provider: ScannedProvider,
		shared: Map<unknown, ToolDefinition>,
		defaultModel: LlmModel,
	): DiscoveredProvider {
		const metadata: unknown = Reflect.getMetadata(AGENT_METADATA, provider.type);
		return {
			providerName: provider.name,
			metadata,
			model: this.modelOf(metadata, defaultModel),
			instructions: this.instructionsOf(metadata),
			transfers: Reflect.getMetadata(TRANSFERS_TO_METADATA, provider.type),
			delegations: Reflect.getMetadata(DELEGATES_TO_METADATA, provider.type),
			tools: [...this.declaredTools(metadata, shared), ...this.ownTools(provider)],
			skills: this.ownSkills(provider),
		};
	}

	private modelOf(metadata: unknown, defaultModel: LlmModel): LlmModel {
		const declared = typeof metadata === "object" && metadata !== null ? Reflect.get(metadata, "model") : undefined;
		return this.isModel(declared) ? declared : defaultModel;
	}

	/** An agent may hand the module a model instance; anything else falls back to the default. */
	private isModel(value: unknown): value is LlmModel {
		return typeof value === "object" && value !== null && typeof Reflect.get(value, "generate") === "function";
	}

	private instructionsOf(metadata: unknown): PromptInstructions | undefined {
		const prompt = typeof metadata === "object" && metadata !== null ? Reflect.get(metadata, "prompt") : undefined;
		return typeof prompt === "string" ? PromptInstructions.from(prompt) : undefined;
	}

	private declaredTools(metadata: unknown, shared: Map<unknown, ToolDefinition>): readonly ToolDefinition[] {
		const declared = typeof metadata === "object" && metadata !== null ? Reflect.get(metadata, "tools") : undefined;
		if (!Array.isArray(declared)) return [];
		const found: ToolDefinition[] = [];
		for (const entry of declared) {
			const tool = shared.get(entry);
			if (tool !== undefined) found.push(tool);
		}
		return found;
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

	private ownSkills(provider: ScannedProvider): readonly SkillDefinition[] {
		const inline: unknown = Reflect.getMetadata(INLINE_SKILLS_METADATA, provider.type);
		if (!Array.isArray(inline)) return [];
		return inline.map((entry) =>
			this.skills.fromMethod(
				provider.instance,
				String(Reflect.get(Object(entry), "method")),
				Reflect.get(Object(entry), "options"),
				provider.name,
			),
		);
	}
}
