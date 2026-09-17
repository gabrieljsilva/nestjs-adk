import { NestAgentScanner } from "../../../adapters/nest/scanning/nest-agent-scanner.service";
import { NestComponentDiscovery } from "../../../adapters/nest/scanning/nest-component-discovery.service";
import { NestControllerScanner } from "../../../adapters/nest/scanning/nest-controller-scanner.service";
import type { ContainerProvider } from "../../../adapters/nest/scanning/nest-provider-scan.service";
import { NestProviderScan } from "../../../adapters/nest/scanning/nest-provider-scan.service";
import { FileSystemPromptSource } from "../../../adapters/prompt/file-system-prompt-source.adapter";
import type { IdGenerator } from "../../../common/identity/id-generator.contract";
import type { Clock } from "../../../common/time/clock.contract";
import type { SessionEventConsumer } from "../../../contracts/events/session-event-consumer.contract";
import type { ModelResolver } from "../../../contracts/model/model-resolver.contract";
import type { PromptSource } from "../../../contracts/model/prompt-source.contract";
import type { ArtifactStorage } from "../../../contracts/storage/artifact-storage.contract";
import type { SessionStorage } from "../../../contracts/storage/session-storage.contract";
import type { LlmModel } from "../../../domain/model/llm-model.contract";
import { RuntimeOptions, type RuntimeOptionsPatch } from "../../../runtime/composition/runtime.options";
import type { AdkRuntimeHost } from "../../adk-runtime-host.edge";
import { AgentBinder } from "../agent/agent-binder.service";
import type { AgentRegistry } from "../agent/agent-registry.service";
import { ConflictingPromptOptionsError } from "../errors/conflicting-prompt-options.error";
import { AgentPromptScan } from "../prompt/agent-prompt-scan.service";
import { AgentPrompting } from "../prompt/agent-prompting.service";
import type { AdkModuleOptions } from "./adk-module.options";

/**
 * Turns a finished container into a running runtime, in four steps.
 *
 * Read the container, read what the decorators declared, compose the runtime, hand each
 * agent class its handle. Nothing here decides when it happens: the module calls it from a
 * lifecycle hook, which is the only moment NestJS promises that every instance exists and
 * is the one it will keep.
 *
 * It is a class of its own rather than four private methods on the module so the sequence
 * can be driven without a container: a fake list of providers in, a composed catalog and a
 * bound agent out.
 */
export class AdkComposer {
	public constructor(
		private readonly host: AdkRuntimeHost,
		private readonly registry: AgentRegistry,
		private readonly options: AdkModuleOptions,
		private readonly storage: SessionStorage,
		private readonly artifacts: ArtifactStorage,
		private readonly clock: Clock,
		private readonly ids: IdGenerator,
		/** Absent means the runtime picks its own, exactly as the options declared. */
		private readonly models?: ModelResolver,
		/** Appended to the consumers the options declared, never replacing them. */
		private readonly extraConsumers: readonly SessionEventConsumer[] = [],
		/** Absent means the options' own default model answers for undeclared agents. */
		private readonly defaultModel?: LlmModel,
		/** Runtime fields replaced by name after the application declared them. */
		private readonly runtimePatch: RuntimeOptionsPatch = {},
		private readonly scan: NestProviderScan = new NestProviderScan(),
		private readonly scanner: NestAgentScanner = new NestAgentScanner(),
		private readonly discovery: NestComponentDiscovery = new NestComponentDiscovery(),
		private readonly prompts: AgentPromptScan = new AgentPromptScan(),
		private readonly controllers: NestControllerScanner = new NestControllerScanner(),
	) {}

	/** Answers how many agent classes were bound, which is what a caller can assert on. */
	public async compose(providers: readonly ContainerProvider[]): Promise<number> {
		const scanned = this.scan.read(providers);
		const shared = this.scanner.sharedTools(scanned);
		const discovered = this.scanner.scan(scanned, this.defaultModel ?? this.options.defaultModel, shared);
		const declared = this.discovery.discover(this.prompts.attach(discovered, scanned));

		const exposed = this.controllers.scan(scanned, shared);

		await this.host.start(declared, this.storage, this.artifacts, this.clock, this.ids, this.declaredRuntime(), exposed);
		return new AgentBinder(this.registry, new AgentPrompting(this.promptSource())).bind(scanned);
	}

	/** The application's own source, or files under the directory it named. */
	private promptSource(): PromptSource {
		const declared = this.options.promptSource;
		const dir = this.options.prompts?.dir;
		if (declared !== undefined && dir !== undefined) throw new ConflictingPromptOptionsError();
		return declared ?? new FileSystemPromptSource(dir);
	}

	/** The options' runtime, patched by name, with the container's resolver and appended consumers. */
	private declaredRuntime(): RuntimeOptions {
		const patched = (this.options.runtime ?? new RuntimeOptions()).with(this.runtimePatch);
		return patched.with({
			models: this.models,
			consumers: [...patched.consumers, ...this.extraConsumers],
		});
	}
}
