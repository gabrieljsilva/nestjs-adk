import {
	ADK_DEFAULT_MODEL,
	ADK_EVENT_CONSUMERS,
	ADK_OPTIONS,
	ADK_RUNTIME_PATCH,
	type AdkModuleOptions,
	AdkRuntimeHost,
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
import { AdkTestBed } from "./adk-test-bed";
import { UnknownTestAgentError } from "./errors/unknown-test-agent.error";
import { UnscriptedAgentError } from "./errors/unscripted-agent.error";
import { RoutingModelResolver } from "./routing-model-resolver";
import { RunRecorder } from "./run-recorder";
import { ScriptedModel } from "./scripted-model";
import type { ToolFake } from "./tool-fake";

/** What a test may hand `withModelFor`: the class an application injects, or the declared name. */
type AgentRef = unknown;

/**
 * Builds a booted application with the pieces a test decided to replace.
 *
 * It wraps NestJS's own builder rather than hiding it: `overriding` passes any token
 * straight through, so a database or a repository is replaced the way it always was, and
 * what this adds is only what the runtime needed a seam for.
 *
 * The default is deliberately strict. A bed whose agents are not all scripted refuses to
 * boot, because an agent carrying a real model in its decorator would turn a suite that
 * costs nothing into a bill, and the failure names the agents rather than the symptom.
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

	/** The application as it is, with the module metadata a test would have written. */
	public static for(metadata: ModuleMetadata): AdkTestBedBuilder {
		return new AdkTestBedBuilder(Test.createTestingModule(metadata));
	}

	/** A builder somebody already configured, for a test that has its own overrides to add. */
	public static from(builder: TestingModuleBuilder): AdkTestBedBuilder {
		return new AdkTestBedBuilder(builder);
	}

	/**
	 * The model every agent that declared none answers on.
	 *
	 * An agent that declared its own model in `@Agent` keeps it, exactly as in production.
	 * Routing one of those to something else is `withModelFor`, which is explicit on purpose.
	 */
	public withModel(model: LlmModel): this {
		this.fallback = model;
		return this;
	}

	/**
	 * One agent answers on this model, whoever asked it.
	 *
	 * The routing sits in the runtime's own resolver, so it holds for a question asked
	 * directly, for a session transferred to this agent and for a task delegated to it. That
	 * is what makes a mixed run possible: a real provider deciding, scripts answering.
	 */
	public withModelFor(agent: AgentRef, model: LlmModel): this {
		this.routed.set(AdkTestBedBuilder.nameOf(agent), model);
		return this;
	}

	/**
	 * A script for one agent, queued through the callback and owned by the bed.
	 *
	 * Each agent gets a script of its own, which is what keeps a transfer or a delegation
	 * from consuming turns meant for somebody else. The script is strict: a run that asks
	 * for a turn nobody queued fails naming the agent.
	 */
	public withScript(agent: AgentRef, queue: (script: ScriptedModel) => void): this {
		const name = AdkTestBedBuilder.nameOf(agent);
		const script = this.scripts.get(name) ?? new ScriptedModel(name).strict();
		queue(script);
		this.scripts.set(name, script);
		this.routed.set(name, script);
		return this;
	}

	/**
	 * Replaces what a tool does, keeping the tool the application declared.
	 *
	 * The double is put on the instance the container built rather than registered in its
	 * place, which keeps the name, the schema, the effect and the identity, so only the
	 * behaviour changes, and lets the fake record what the tool was called with.
	 *
	 * `overrideProvider` answers the same need and works in every form, since discovery reads
	 * a component's declaration off the injection token. Prefer this one for the recording;
	 * reach for the builder when the double needs dependencies of its own.
	 */
	public replaceTool(type: unknown, fake: ToolFake): this {
		ToolMetadata.findOrFail(type);
		this.fakes.set(type, fake);
		return this;
	}

	/** Watches the runs, alongside the consumers the application declared rather than instead of them. */
	public withConsumers(...consumers: readonly SessionEventConsumer[]): this {
		this.consumers.push(...consumers);
		return this;
	}

	/** Replaces runtime fields by name: limits, compaction, summarizer, approvals. */
	public withRuntime(patch: RuntimeOptionsPatch): this {
		this.runtimePatch = { ...this.runtimePatch, ...patch };
		return this;
	}

	/** Any other token, straight through to the NestJS builder. */
	public overriding(token: unknown, value: unknown): this {
		this.builder.overrideProvider(Object(token)).useValue(value);
		return this;
	}

	/**
	 * Lets an agent answer on a model the test did not script.
	 *
	 * This is what a suite that spends money says out loud. Without it a bed refuses to boot
	 * with an unscripted agent, which is the check that keeps a free suite free.
	 */
	public allowingUnscriptedModels(): this {
		this.allowsUnscripted = true;
		return this;
	}

	/**
	 * Compiles and initializes, which is when the runtime is composed.
	 *
	 * Both steps happen here because the ADK composes in `onModuleInit`: a bed that only
	 * compiled would hand back a container whose agents cannot answer yet.
	 */
	public async boot(): Promise<AdkTestBed> {
		const recorder = new RunRecorder();
		this.builder.overrideProvider(ADK_EVENT_CONSUMERS).useValue([recorder, ...this.consumers]);
		this.builder.overrideProvider(ADK_RUNTIME_PATCH).useValue(this.runtimePatch);
		if (this.fallback !== undefined) this.builder.overrideProvider(ADK_DEFAULT_MODEL).useValue(this.fallback);
		if (this.routed.size > 0) {
			// The declared resolver is read from the options rather than injected: a factory that
			// overrides a token cannot also depend on it.
			this.builder.overrideProvider(ModelResolver).useFactory({
				factory: (declared: AdkModuleOptions) => this.resolverOver(declared.runtime?.models),
				inject: [ADK_OPTIONS],
			});
		}

		const module = await this.builder.compile();
		// Between the two: the container has built every instance, and the runtime has not yet
		// read them, which is the one moment a tool's behaviour can be replaced in place.
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

	/** A name nobody declared is a typo, and the boot is where a typo is cheapest to find. */
	private assertAgentsExist(module: TestingModule): void {
		const declared = module.get(AdkRuntimeHost).runtime.catalog.names;
		for (const agent of this.routed.keys()) {
			if (!declared.includes(agent)) throw new UnknownTestAgentError(agent, declared);
		}
	}

	/**
	 * Every agent answers on a model this test chose, and not on one it inherited.
	 *
	 * The question is not whether the model is a script: it is whether the test knows what
	 * the agent runs on. A model that arrived from the decorator or from the module default
	 * is the accident worth catching, because that is how a suite meant to be free reaches a
	 * provider and bills somebody.
	 */
	private assertEveryAgentIsScripted(module: TestingModule): void {
		if (this.allowsUnscripted) return;
		const runtime = module.get(AdkRuntimeHost).runtime;
		const chosen = new Set<LlmModel>([...this.routed.values(), ...(this.fallback === undefined ? [] : [this.fallback])]);
		const unscripted = runtime.catalog.names.filter(
			(name) => !chosen.has(runtime.models.resolve(runtime.catalog.findOrFail(AgentName.from(name)))),
		);
		if (unscripted.length > 0) throw new UnscriptedAgentError(unscripted);
	}

	private static nameOf(agent: AgentRef): string {
		return typeof agent === "string" ? agent : AgentMetadata.findOrFail(agent).name;
	}
}
