import { Inject, Injectable, type OnApplicationBootstrap, type Type } from "@nestjs/common";
import { DiscoveryService, ModuleRef } from "@nestjs/core";
import { type AdkModel, isAdkModel } from "../abstracts/adk-model";
import type { AdkSkill } from "../abstracts/adk-skill";
import type { AdkTool } from "../abstracts/adk-tool";
import {
	ADK_OPTIONS,
	ADK_RUNNER,
	AGENT_METADATA,
	INLINE_SKILLS_METADATA,
	INLINE_TOOLS_METADATA,
	SKILL_METADATA,
	TOOL_METADATA,
	WORKFLOW_METADATA,
} from "../constants";
import type { InlineSkillMetadata } from "../decorators/skill.decorator";
import type { InlineToolMetadata } from "../decorators/tool.decorator";
import {
	AgentNotFoundError,
	ConflictingPromptError,
	DuplicateAgentNameError,
	InvalidModelError,
	InvalidWorkflowError,
	MissingModelError,
	ReservedMethodError,
	UnregisteredModelError,
	UnregisteredPromptError,
	UnregisteredSkillError,
	UnregisteredSubAgentError,
	UnregisteredToolError,
	UnresolvedToolsetError,
	UnsupportedModelScopeError,
} from "../errors";
import { ModelRouter, type RouterTarget, isModelSpec } from "../models/model-specs";
import type { AdkModuleOptions } from "../module/adk-options";
import type { AdkPrompt } from "../prompts/adk-prompt";
import type { AgentOptions, ModelInput, SkillOptions, ToolOptions, WorkflowOptions } from "../types/options";
import { type ToolsetRef, ToolsetResolver, isToolsetRef } from "../types/toolset";
import { AgentDefinition, type SkillBinding, type ToolBinding } from "./agent-definition";
import { AgentRef } from "./agent-ref";

/**
 * Discovers decorated providers (@Agent/@WorkflowAgent/@Tool/@Skill), builds the definitions,
 * and validates the entire configuration at bootstrap — fail-fast, pointing at the wrong class.
 */
@Injectable()
export class AgentRegistry implements OnApplicationBootstrap {
	private readonly byName = new Map<string, AgentDefinition>();
	private readonly byType = new Map<Type, AgentDefinition>();
	private readonly refs = new Map<Type, AgentRef>();
	/** Test hook (TestAgent): per-agent model override applied at run resolution — never set in production. */
	private readonly modelOverrides = new Map<Type, ModelInput>();
	private built = false;

	public constructor(
		private readonly discovery: DiscoveryService,
		private readonly moduleRef: ModuleRef,
		@Inject(ADK_OPTIONS) private readonly options: AdkModuleOptions,
	) {}

	public onApplicationBootstrap(): void {
		this.build();
	}

	public list(): AgentDefinition[] {
		this.ensureBuilt();
		return [...this.byName.values()];
	}

	public get(name: string): AgentDefinition {
		this.ensureBuilt();
		const definition = this.byName.get(name);
		if (!definition) throw new AgentNotFoundError(name);
		return definition;
	}

	public getByType(type: Type): AgentDefinition {
		this.ensureBuilt();
		const definition = this.byType.get(type);
		if (!definition) throw new AgentNotFoundError(type.name);
		return definition;
	}

	/** Lazy handle — safe to inject before bootstrap. */
	/** Test hook: forces this agent's model on subsequent runs (used by @nestjs-adk/testing's TestAgent). */
	public overrideModel(type: Type, model: ModelInput): void {
		this.modelOverrides.set(type, model);
	}

	/** Model for a run: test override (if any) wins over the boot-resolved one. */
	public modelFor(definition: AgentDefinition): ModelInput | undefined {
		return this.modelOverrides.get(definition.type) ?? definition.model;
	}

	public getRef(type: Type): AgentRef {
		let ref = this.refs.get(type);
		if (!ref) {
			// Resolved via token to avoid a static registry ↔ runner cycle.
			ref = new AgentRef(this, type, () => this.moduleRef.get(ADK_RUNNER, { strict: false }));
			this.refs.set(type, ref);
		}
		return ref;
	}

	private ensureBuilt(): void {
		if (!this.built) this.build();
	}

	private build(): void {
		if (this.built) return;
		this.built = true;

		const wrappers = this.discovery
			.getProviders()
			.filter((wrapper) => typeof wrapper.metatype === "function" && wrapper.instance);

		const toolInstances = new Map<Type, AdkTool>();
		const skillInstances = new Map<Type, AdkSkill>();
		const agentWrappers: Array<{ type: Type; instance: object }> = [];

		for (const wrapper of wrappers) {
			const type = wrapper.metatype as Type;
			if (Reflect.getMetadata(TOOL_METADATA, type)) toolInstances.set(type, wrapper.instance as AdkTool);
			if (Reflect.getMetadata(SKILL_METADATA, type)) skillInstances.set(type, wrapper.instance as AdkSkill);
			if (Reflect.getMetadata(AGENT_METADATA, type) || Reflect.getMetadata(WORKFLOW_METADATA, type)) {
				agentWrappers.push({ type, instance: wrapper.instance as object });
			}
		}

		const agentTypes = new Set(agentWrappers.map((w) => w.type));

		for (const { type, instance } of agentWrappers) {
			const definition = this.createDefinition(type, instance, toolInstances, skillInstances, agentTypes);

			const existing = this.byName.get(definition.name);
			if (existing) throw new DuplicateAgentNameError(definition.name, [existing.type.name, type.name]);

			this.byName.set(definition.name, definition);
			this.byType.set(type, definition);
		}
	}

	private createDefinition(
		type: Type,
		instance: object,
		toolInstances: Map<Type, AdkTool>,
		skillInstances: Map<Type, AdkSkill>,
		agentTypes: Set<Type>,
	): AgentDefinition {
		const agentOptions: AgentOptions | undefined = Reflect.getMetadata(AGENT_METADATA, type);
		const workflow: WorkflowOptions | undefined = Reflect.getMetadata(WORKFLOW_METADATA, type);

		// The instance is the execution handle — own methods must not shadow the inherited API.
		for (const reserved of ["ask", "stream", "approve", "reject"]) {
			if (Object.getOwnPropertyNames(type.prototype).includes(reserved)) {
				throw new ReservedMethodError(type.name, reserved);
			}
		}

		if (workflow) {
			if (workflow.agents.length === 0) throw new InvalidWorkflowError(type.name, "it has no agents");
			for (const agent of workflow.agents) {
				if (!agentTypes.has(agent as Type)) {
					throw new InvalidWorkflowError(type.name, `agent ${(agent as Type).name} is not registered as a provider`);
				}
			}
			return new AgentDefinition(
				workflow.name,
				type,
				instance,
				undefined,
				undefined,
				[],
				[],
				[],
				undefined,
				undefined,
				undefined,
				workflow,
			);
		}

		// biome-ignore lint/style/noNonNullAssertion: agentWrappers only enters with one of the two metadata
		const options = agentOptions!;

		const rawModel = options.model ?? this.options.defaultModel;
		if (rawModel === undefined) throw new MissingModelError(type.name);
		const model = this.resolveModelInput(rawModel, type.name);

		const tools: ToolBinding[] = [];
		const toolsets: ToolsetRef[] = [];
		for (const toolRef of options.tools ?? []) {
			if (isToolsetRef(toolRef)) {
				if (!this.hasToolsetResolver()) throw new UnresolvedToolsetError(type.name, toolRef.__adkToolset);
				toolsets.push(toolRef);
				continue;
			}
			const toolInstance = toolInstances.get(toolRef);
			if (!toolInstance) throw new UnregisteredToolError(type.name, toolRef.name);
			const toolOptions: ToolOptions = Reflect.getMetadata(TOOL_METADATA, toolRef);
			tools.push({ kind: "class", type: toolRef, instance: toolInstance, options: toolOptions });
		}
		const inlineTools: InlineToolMetadata[] = Reflect.getMetadata(INLINE_TOOLS_METADATA, type) ?? [];
		for (const inline of inlineTools) tools.push({ kind: "inline", method: inline.method, options: inline.options });

		const skills: SkillBinding[] = [];
		for (const skillType of options.skills ?? []) {
			const skillInstance = skillInstances.get(skillType);
			if (!skillInstance) throw new UnregisteredSkillError(type.name, skillType.name);
			const skillOptions: Required<SkillOptions> = Reflect.getMetadata(SKILL_METADATA, skillType);
			skills.push({ kind: "class", type: skillType, instance: skillInstance, options: skillOptions });
		}
		const inlineSkills: InlineSkillMetadata[] = Reflect.getMetadata(INLINE_SKILLS_METADATA, type) ?? [];
		for (const inline of inlineSkills) skills.push({ kind: "inline", method: inline.method, options: inline.options });

		// Instruction: prompt (text | AdkPrompt class) XOR promptFile.
		if (options.prompt !== undefined && options.promptFile !== undefined) throw new ConflictingPromptError(type.name);
		let promptText: string | undefined;
		let promptInstance: AdkPrompt | undefined;
		if (typeof options.prompt === "string") {
			promptText = options.prompt;
		} else if (options.prompt) {
			try {
				promptInstance = this.moduleRef.get(options.prompt, { strict: false });
			} catch {
				throw new UnregisteredPromptError(type.name, options.prompt.name);
			}
		}

		const subAgents: Type[] = [];
		for (const subAgent of options.subAgents ?? []) {
			if (!agentTypes.has(subAgent as Type)) throw new UnregisteredSubAgentError(type.name, subAgent.name);
			subAgents.push(subAgent as Type);
		}

		return new AgentDefinition(
			options.name,
			type,
			instance,
			options,
			model,
			tools,
			skills,
			subAgents,
			promptText,
			options.promptFile,
			promptInstance,
			undefined,
			options.output,
			options.outputKey,
			toolsets,
		);
	}

	/** AdkModel classes → DI instances at boot (agent model and router targets), fail-fast like prompts. */
	private resolveModelInput(model: ModelInput, agentClass: string): ModelInput {
		if (typeof model === "function") return this.getModelInstance(model as Type, agentClass);

		if (isModelSpec(model) && model.__adkModelSpec === "router") {
			let changed = false;
			const targets: Record<string, RouterTarget> = {};
			for (const [key, target] of Object.entries(model.targets)) {
				if (typeof target === "function") {
					targets[key] = this.getModelInstance(target as Type, agentClass);
					changed = true;
				} else {
					targets[key] = target;
				}
			}
			// spread preserves any future router options beyond targets/strategy in the resolved copy
			return changed ? new ModelRouter({ ...model, targets }) : model;
		}

		return model;
	}

	private getModelInstance(type: Type, agentClass: string): AdkModel {
		let instance: unknown;
		try {
			instance = this.moduleRef.get(type, { strict: false });
		} catch (error) {
			// Scoped providers get a dedicated message — the generic one would suggest the wrong fix.
			// Nest exceptions keep name="Error", so the constructor name is the reliable discriminator.
			const boot =
				(error as Error)?.constructor?.name === "InvalidClassScopeException"
					? new UnsupportedModelScopeError(agentClass, type.name)
					: new UnregisteredModelError(agentClass, type.name);
			boot.cause = error;
			throw boot;
		}
		if (!isAdkModel(instance)) throw new InvalidModelError(agentClass, type.name);
		return instance;
	}

	private hasToolsetResolver(): boolean {
		try {
			return Boolean(this.moduleRef.get(ToolsetResolver, { strict: false }));
		} catch {
			return false;
		}
	}
}
