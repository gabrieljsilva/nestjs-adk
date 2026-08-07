import type { AgentFailoverPolicy } from "../../domain/agent/agent-failover-policy";
import { SequentialFailoverPolicy } from "../../domain/agent/sequential-failover-policy";
import type { AdkCompactionPolicy } from "../../domain/context/adk-compaction-policy";
import type { LlmModel } from "../../domain/model/llm-model";
import { PromptInstructions } from "../../domain/prompt/prompt-instructions";
import type { SkillDefinition } from "../../domain/skill/skill-definition";
import type { ToolDefinition } from "../../domain/tool/tool-definition";
import { InvalidAgentMetadataError } from "./errors/invalid-agent-metadata.error";
import { UnregisteredToolError } from "./errors/unregistered-tool.error";
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
			model: this.modelOf(metadata, defaultModel, provider.name),
			failover: this.failoverOf(metadata, provider.name),
			compaction: this.compactionOf(metadata, provider.name),
			instructions: this.instructionsOf(metadata, provider.name),
			transfers: Reflect.getMetadata(TRANSFERS_TO_METADATA, provider.type),
			delegations: Reflect.getMetadata(DELEGATES_TO_METADATA, provider.type),
			tools: [...this.declaredTools(metadata, shared, provider.name), ...this.ownTools(provider)],
			skills: this.ownSkills(provider),
		};
	}

	/**
	 * What the decorator wrote under this key, and nothing when it wrote nothing.
	 *
	 * The difference between the two is the whole rule for every optional field below. Absent
	 * means the agent asked for the default and gets it. Present and wrong means the developer
	 * declared something and would otherwise be handed the default anyway, believing they had
	 * configured the agent, which is the failure this reader exists to make loud.
	 */
	private declaredField(metadata: unknown, key: string): unknown {
		return typeof metadata === "object" && metadata !== null ? Reflect.get(metadata, key) : undefined;
	}

	private modelOf(metadata: unknown, defaultModel: LlmModel, providerName: string): LlmModel {
		const declared = this.declaredField(metadata, "model");
		if (declared === undefined) return defaultModel;
		if (this.isModel(declared)) return declared;
		throw new InvalidAgentMetadataError(
			providerName,
			"model is not a model. @Agent takes an LlmModel instance, not the name of one.",
		);
	}

	/** An agent may hand the module a model instance, which is anything that can generate. */
	private isModel(value: unknown): value is LlmModel {
		return typeof value === "object" && value !== null && typeof Reflect.get(value, "generate") === "function";
	}

	/** A list of models becomes a sequential walk, and a policy stays itself. */
	private failoverOf(metadata: unknown, providerName: string): AgentFailoverPolicy | undefined {
		const declared = this.declaredField(metadata, "failover");
		if (declared === undefined) return undefined;
		if (this.isFailoverPolicy(declared)) return declared;
		if (!Array.isArray(declared)) {
			throw new InvalidAgentMetadataError(providerName, "failover is neither a list of models nor a policy.");
		}
		if (declared.length === 0) {
			throw new InvalidAgentMetadataError(providerName, "failover is an empty list. Leave it out to declare none.");
		}
		const wrong = declared.findIndex((entry) => !this.isModel(entry));
		if (wrong >= 0) {
			throw new InvalidAgentMetadataError(providerName, `failover entry ${wrong} is not a model.`);
		}
		return new SequentialFailoverPolicy(declared as LlmModel[]);
	}

	private isFailoverPolicy(value: unknown): value is AgentFailoverPolicy {
		return typeof value === "object" && value !== null && typeof Reflect.get(value, "next") === "function";
	}

	/** Absent means the module's policy answers for this agent, which may itself be absent. */
	private compactionOf(metadata: unknown, providerName: string): AdkCompactionPolicy | undefined {
		const declared = this.declaredField(metadata, "compaction");
		if (declared === undefined) return undefined;
		if (this.isCompaction(declared)) return declared;
		throw new InvalidAgentMetadataError(providerName, "compaction cannot decide anything: it has no decide method.");
	}

	private isCompaction(value: unknown): value is AdkCompactionPolicy {
		return typeof value === "object" && value !== null && typeof Reflect.get(value, "decide") === "function";
	}

	private instructionsOf(metadata: unknown, providerName: string): PromptInstructions | undefined {
		const prompt = this.declaredField(metadata, "prompt");
		if (prompt === undefined) return undefined;
		if (typeof prompt === "string") return PromptInstructions.from(prompt);
		throw new InvalidAgentMetadataError(providerName, "prompt is not a string.");
	}

	/**
	 * A listed tool that resolves to nothing is a boot failure, not a shorter list.
	 *
	 * The lookup is by the token the agent wrote, so an overridden provider still answers here:
	 * what does not answer is a tool nobody registered, and dropping it would hand the model an
	 * agent quietly missing the one thing it was built to do.
	 */
	private declaredTools(
		metadata: unknown,
		shared: Map<unknown, ToolDefinition>,
		providerName: string,
	): readonly ToolDefinition[] {
		const declared = this.declaredField(metadata, "tools");
		if (declared === undefined) return [];
		if (!Array.isArray(declared)) throw new InvalidAgentMetadataError(providerName, "tools is not a list.");
		return declared.map((entry) => {
			const tool = shared.get(entry);
			if (tool === undefined) {
				throw new UnregisteredToolError(
					providerName,
					this.nameOf(entry),
					[...shared.values()].map((registered) => registered.name),
				);
			}
			return tool;
		});
	}

	/** A class is named by its own name, and anything else by what it prints as. */
	private nameOf(entry: unknown): string {
		const declared = typeof entry === "function" ? Reflect.get(entry, "name") : undefined;
		return typeof declared === "string" && declared.length > 0 ? declared : String(entry);
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
