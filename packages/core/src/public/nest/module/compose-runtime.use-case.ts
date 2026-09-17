import type { ContainerProvider } from "../../../adapters/nest/scanning/nest-provider-scan.service";
import { NestScanService } from "../../../adapters/nest/scanning/nest-scan.service";
import type { IdGenerator } from "../../../common/identity/id-generator.contract";
import type { Clock } from "../../../common/time/clock.contract";
import type { SessionEventConsumer } from "../../../contracts/events/session-event-consumer.contract";
import type { ModelResolver } from "../../../contracts/model/model-resolver.contract";
import type { ArtifactStorage } from "../../../contracts/storage/artifact-storage.contract";
import type { SessionStorage } from "../../../contracts/storage/session-storage.contract";
import type { LlmModel } from "../../../domain/model/llm-model.contract";
import { RuntimeOptions, type RuntimeOptionsPatch } from "../../../runtime/composition/runtime.options";
import type { AdkRuntime } from "../../adk-runtime.edge";
import { AgentBinder } from "../agent/agent-binder.service";
import type { AgentRegistry } from "../agent/agent-registry.service";
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
export class ComposeRuntimeUseCase {
	public constructor(
		private readonly host: AdkRuntime,
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
		private readonly scan: NestScanService = new NestScanService(new AgentPromptScan()),
	) {}

	/** Answers how many agent classes were bound, which is what a caller can assert on. */
	public async execute(providers: readonly ContainerProvider[]): Promise<number> {
		const scanned = this.scan.readProviders(providers);
		const shared = this.scan.readSharedTools(scanned);
		const declared = this.scan.readAgents(scanned, this.defaultModel ?? this.options.defaultModel, shared);
		const exposed = this.scan.readExposedTools(scanned, shared);

		await this.host.start(declared, this.storage, this.artifacts, this.clock, this.ids, this.declaredRuntime(), exposed);
		return new AgentBinder(this.registry, new AgentPrompting(this.options.resolvePromptSource())).bind(scanned);
	}

	/** The options' runtime, patched by name, with the container's resolver and appended consumers. */
	private declaredRuntime(): RuntimeOptions {
		const patched = (this.options.runtime ?? new RuntimeOptions()).with(this.runtimePatch);
		return patched.with({
			model: { resolver: this.models },
			lifecycle: { consumers: [...patched.lifecycle.consumers, ...this.extraConsumers] },
		});
	}
}
