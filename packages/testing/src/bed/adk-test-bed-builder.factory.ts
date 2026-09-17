import {
	ADK_DEFAULT_MODEL,
	ADK_EVENT_CONSUMERS,
	ADK_OPTIONS,
	ADK_RUNTIME_PATCH,
	type AdkModuleOptions,
	AdkRuntime,
	type AdkTool,
	AgentMetadata,
	AgentName,
	type LlmModel,
	ModelResolver,
	type RuntimeOptionsPatch,
	type SessionEventConsumer,
	type ToolContext,
	ToolMetadata,
} from "@nestjs-adk/core";
import type { ModuleMetadata } from "@nestjs/common";
import { Test, type TestingModule, type TestingModuleBuilder } from "@nestjs/testing";
import { UnknownTestAgentError } from "../errors/unknown-test-agent.error";
import { UnscriptedAgentError } from "../errors/unscripted-agent.error";
import { RoutingModelResolver } from "../model/routing-model-resolver.service";
import { ScriptedModel } from "../model/scripted-model.double";
import { RunRecorder } from "../recording/run-recorder.service";
import type { ToolFake } from "../tool-fake.double";
import { AdkTestBed } from "./adk-test-bed.service";

type AgentRef = unknown;

/**
 * Builds a test bed over the application's real container: `for(metadata)` or `from(builder)`,
 * then a script or a model per agent, tool doubles, runtime overrides and `boot`.
 *
 * `boot` compiles and initializes the module, because the runtime is composed in
 * `onModuleInit`. A bed whose agents do not all answer on a model the test chose refuses to boot
 * with `UnscriptedAgentError`, which is what keeps a free suite from reaching a provider by
 * accident; `allowingUnscriptedModels` is how a suite says it means to.
 */
export class AdkTestBedBuilder {
	private readonly scripts = new Map<string, ScriptedModel>();
	private readonly routed = new Map<string, LlmModel>();
	private readonly fakes = new Map<unknown, ToolFake>();
	private readonly consumers: SessionEventConsumer[] = [];
	private runtimePatch: RuntimeOptionsPatch = {};
	private fallback?: LlmModel;
	private allowsUnscripted = false;

	public constructor(private readonly builder: TestingModuleBuilder) {}

	public static for(metadata: ModuleMetadata): AdkTestBedBuilder {
		return new AdkTestBedBuilder(Test.createTestingModule(metadata));
	}

	public static from(builder: TestingModuleBuilder): AdkTestBedBuilder {
		return new AdkTestBedBuilder(builder);
	}

	public withModel(model: LlmModel): this {
		this.fallback = model;
		return this;
	}

	public withAgentModel(agent: AgentRef, model: LlmModel): this {
		this.routed.set(AdkTestBedBuilder.readName(agent), model);
		return this;
	}

	public withScript(agent: AgentRef, queue: (script: ScriptedModel) => void): this {
		const name = AdkTestBedBuilder.readName(agent);
		const script = this.scripts.get(name) ?? new ScriptedModel(name).strict();
		queue(script);
		this.scripts.set(name, script);
		this.routed.set(name, script);
		return this;
	}

	public replaceTool(type: unknown, fake: ToolFake): this {
		ToolMetadata.findOrFail(type);
		this.fakes.set(type, fake);
		return this;
	}

	public withConsumers(...consumers: readonly SessionEventConsumer[]): this {
		this.consumers.push(...consumers);
		return this;
	}

	public withRuntime(patch: RuntimeOptionsPatch): this {
		this.runtimePatch = {
			...this.runtimePatch,
			...patch,
			context: { ...this.runtimePatch.context, ...patch.context },
			cost: { ...this.runtimePatch.cost, ...patch.cost },
			tools: { ...this.runtimePatch.tools, ...patch.tools },
			lifecycle: { ...this.runtimePatch.lifecycle, ...patch.lifecycle },
			model: { ...this.runtimePatch.model, ...patch.model },
		};
		return this;
	}

	public overriding(token: unknown, value: unknown): this {
		this.builder.overrideProvider(Object(token)).useValue(value);
		return this;
	}

	public allowingUnscriptedModels(): this {
		this.allowsUnscripted = true;
		return this;
	}

	public async boot(): Promise<AdkTestBed> {
		const recorder = new RunRecorder();
		this.builder.overrideProvider(ADK_EVENT_CONSUMERS).useValue([recorder, ...this.consumers]);
		this.builder.overrideProvider(ADK_RUNTIME_PATCH).useValue(this.runtimePatch);
		if (this.fallback !== undefined) this.builder.overrideProvider(ADK_DEFAULT_MODEL).useValue(this.fallback);
		if (this.routed.size > 0) {
			this.builder.overrideProvider(ModelResolver).useFactory({
				factory: (declared: AdkModuleOptions) => this.resolverOver(declared.runtime?.model.resolver),
				inject: [ADK_OPTIONS],
			});
		}

		const module = await this.builder.compile();
		this.applyToolFakes(module);
		await module.init();
		this.assertAgentsExist(module);
		this.assertEveryAgentIsScripted(module);
		return new AdkTestBed(module, recorder, this.scripts, this.fakes);
	}

	private applyToolFakes(module: TestingModule): void {
		for (const [type, fake] of this.fakes) {
			const instance: AdkTool = module.get(Object(type));
			Object.defineProperty(instance, "execute", {
				value: (input: unknown, context: ToolContext) => fake.execute(input, context),
				configurable: true,
				writable: true,
			});
		}
	}

	private resolverOver(declared?: ModelResolver): RoutingModelResolver {
		const routing = new RoutingModelResolver(declared);
		for (const [agent, model] of this.routed) routing.route(agent, model);
		return routing;
	}

	private assertAgentsExist(module: TestingModule): void {
		const declared = module.get(AdkRuntime).runtime.catalog.names;
		for (const agent of this.routed.keys()) {
			if (!declared.includes(agent)) throw new UnknownTestAgentError(agent, declared);
		}
	}

	private assertEveryAgentIsScripted(module: TestingModule): void {
		if (this.allowsUnscripted) return;
		const runtime = module.get(AdkRuntime).runtime;
		const chosen = new Set<LlmModel>([...this.routed.values(), ...(this.fallback === undefined ? [] : [this.fallback])]);
		const unscripted = runtime.catalog.names.filter(
			(name) => !chosen.has(runtime.models.resolve(runtime.catalog.findOrFail(AgentName.from(name)))),
		);
		if (unscripted.length > 0) throw new UnscriptedAgentError(unscripted);
	}

	private static readName(agent: AgentRef): string {
		return typeof agent === "string" ? agent : AgentMetadata.findOrFail(agent).name;
	}
}
