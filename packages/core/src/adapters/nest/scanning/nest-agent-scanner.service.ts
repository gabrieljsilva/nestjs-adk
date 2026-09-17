import type { AgentFailoverPolicy } from "../../../domain/agent/agent-failover.policy";
import type { ModelRetryPolicy } from "../../../domain/agent/model-retry.policy";
import { NoRetryPolicy } from "../../../domain/agent/no-retry.policy";
import { SequentialFailoverPolicy } from "../../../domain/agent/sequential-failover.policy";
import type { AdkCompactionPolicy } from "../../../domain/context/adk-compaction.policy";
import type { LlmModel } from "../../../domain/model/llm-model.contract";
import { PromptInstructions } from "../../../domain/prompt/prompt-instructions.value-object";
import { RunLimits } from "../../../domain/session/run/run-limits.value-object";
import type { SkillDefinition } from "../../../domain/skill/skill-definition.value-object";
import type { ToolDefinition } from "../../../domain/tool/tool-definition.value-object";
import { InvalidAgentMetadataError } from "../errors/invalid-agent-metadata.error";
import { NestSkillFactory } from "../factory/nest-skill.factory";
import { NestToolFactory } from "../factory/nest-tool.factory";
import {
	AGENT_METADATA,
	DELEGATES_TO_METADATA,
	INLINE_SKILLS_METADATA,
	INLINE_TOOLS_METADATA,
	TOOL_METADATA,
	TRANSFERS_TO_METADATA,
} from "../metadata/metadata-keys.token";
import { SharedToolLookup } from "../shared-tool-lookup.service";
import type { DiscoveredProvider } from "./nest-component-discovery.service";
import { ScannedProvider } from "./scanned-provider.value-object";

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

	public scan(
		providers: readonly ScannedProvider[],
		defaultModel?: LlmModel,
		shared: Map<unknown, ToolDefinition> = this.sharedTools(providers),
	): DiscoveredProvider[] {
		return providers
			.filter((provider) => Reflect.getMetadata(AGENT_METADATA, provider.type) !== undefined)
			.map((provider) => this.toDiscovered(provider, shared, defaultModel));
	}

	/** Tools with a provider of their own, keyed by the class an agent lists in `tools`. */
	public sharedTools(providers: readonly ScannedProvider[]): Map<unknown, ToolDefinition> {
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
		defaultModel?: LlmModel,
	): DiscoveredProvider {
		const metadata: unknown = Reflect.getMetadata(AGENT_METADATA, provider.type);
		return {
			providerName: provider.name,
			metadata,
			model: this.resolveModel(metadata, defaultModel, provider.name),
			failover: this.readFailover(metadata, provider.name),
			retry: this.readRetry(metadata, provider.name),
			compaction: this.readCompaction(metadata, provider.name),
			limits: this.readLimits(metadata, provider.name),
			instructions: this.readInstructions(metadata, provider.name),
			transfers: Reflect.getMetadata(TRANSFERS_TO_METADATA, provider.type),
			delegations: Reflect.getMetadata(DELEGATES_TO_METADATA, provider.type),
			tools: [...this.declaredTools(metadata, shared, provider.name), ...this.ownTools(provider)],
			skills: this.ownSkills(provider),
			outputSchema: this.readOutputSchema(metadata, provider.name),
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

	private resolveModel(metadata: unknown, defaultModel: LlmModel | undefined, providerName: string): LlmModel {
		const declared = this.declaredField(metadata, "model");
		if (declared === undefined) {
			if (defaultModel === undefined) {
				throw new InvalidAgentMetadataError(
					providerName,
					"has no model: declare one on @Agent, or a defaultModel on the module.",
				);
			}
			return defaultModel;
		}
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
	private readFailover(metadata: unknown, providerName: string): AgentFailoverPolicy | undefined {
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

	/**
	 * A policy stays itself, and `false` becomes the one that never retries.
	 *
	 * `false` is carried through as a policy rather than dropped for the same reason as
	 * compaction: dropped, it would hand the agent whatever the runtime decided, which is the
	 * opposite of what it said.
	 */
	private readRetry(metadata: unknown, providerName: string): ModelRetryPolicy | undefined {
		const declared = this.declaredField(metadata, "retry");
		if (declared === undefined) return undefined;
		if (declared === false) return new NoRetryPolicy();
		if (this.isRetryPolicy(declared)) return declared;
		throw new InvalidAgentMetadataError(providerName, "retry is neither a retry policy nor false.");
	}

	private isRetryPolicy(value: unknown): value is ModelRetryPolicy {
		return typeof value === "object" && value !== null && typeof Reflect.get(value, "findDelay") === "function";
	}

	private isFailoverPolicy(value: unknown): value is AgentFailoverPolicy {
		return typeof value === "object" && value !== null && typeof Reflect.get(value, "next") === "function";
	}

	/**
	 * Absent means the module's policy answers for this agent, which may itself be absent.
	 * `false` is carried through rather than dropped: it is this agent refusing compaction,
	 * and dropping it would hand the agent whatever the module or the runtime decided.
	 */
	private readCompaction(metadata: unknown, providerName: string): AdkCompactionPolicy | false | undefined {
		const declared = this.declaredField(metadata, "compaction");
		if (declared === undefined) return undefined;
		if (declared === false) return false;
		if (this.isCompaction(declared)) return declared;
		throw new InvalidAgentMetadataError(providerName, "compaction cannot decide anything: it has no decide method.");
	}

	private isCompaction(value: unknown): value is AdkCompactionPolicy {
		return typeof value === "object" && value !== null && typeof Reflect.get(value, "decide") === "function";
	}

	/** Absent means the agent runs under the module's ceiling, which may itself be absent. */
	private readLimits(metadata: unknown, providerName: string): RunLimits | undefined {
		const declared = this.declaredField(metadata, "limits");
		if (declared === undefined) return undefined;
		if (declared instanceof RunLimits) return declared;
		throw new InvalidAgentMetadataError(
			providerName,
			"limits is not run limits. @Agent takes a RunLimits instance, built with RunLimits.of.",
		);
	}

	/**
	 * Absent means this agent answers prose, which is what most agents do.
	 *
	 * The schema itself is not checked here beyond being an object: what a valid schema is belongs
	 * to the provider, and the OpenAI adapter already refuses the ones strict mode rejects, naming
	 * the field. Guessing at that here would fail requests over rules only the provider decides.
	 */
	private readOutputSchema(metadata: unknown, providerName: string): object | undefined {
		const declared = this.declaredField(metadata, "outputSchema");
		if (declared === undefined) return undefined;
		if (typeof declared === "object" && declared !== null && !Array.isArray(declared)) return declared;
		throw new InvalidAgentMetadataError(providerName, "outputSchema is not an object. @Agent takes a JSON schema.");
	}

	private readInstructions(metadata: unknown, providerName: string): PromptInstructions | undefined {
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
		return new SharedToolLookup(shared).resolveAll(declared, providerName);
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
