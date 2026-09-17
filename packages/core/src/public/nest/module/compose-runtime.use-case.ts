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

export class ComposeRuntimeUseCase {
	public constructor(
		private readonly host: AdkRuntime,
		private readonly registry: AgentRegistry,
		private readonly options: AdkModuleOptions,
		private readonly storage: SessionStorage,
		private readonly artifacts: ArtifactStorage,
		private readonly clock: Clock,
		private readonly ids: IdGenerator,
		private readonly models?: ModelResolver,
		private readonly extraConsumers: readonly SessionEventConsumer[] = [],
		private readonly defaultModel?: LlmModel,
		private readonly runtimePatch: RuntimeOptionsPatch = {},
		private readonly scan: NestScanService = new NestScanService(new AgentPromptScan()),
	) {}

	public async execute(providers: readonly ContainerProvider[]): Promise<number> {
		const scanned = this.scan.readProviders(providers);
		const shared = this.scan.readSharedTools(scanned);
		const declared = this.scan.readAgents(scanned, this.defaultModel ?? this.options.defaultModel, shared);
		const exposed = this.scan.readExposedTools(scanned, shared);

		await this.host.start({
			agents: declared,
			storage: this.storage,
			artifacts: this.artifacts,
			clock: this.clock,
			ids: this.ids,
			options: this.declaredRuntime(),
			exposed: exposed,
		});
		return new AgentBinder(this.registry, new AgentPrompting(this.options.resolvePromptSource())).bind(scanned);
	}

	private declaredRuntime(): RuntimeOptions {
		const patched = (this.options.runtime ?? new RuntimeOptions()).with(this.runtimePatch);
		return patched.with({
			model: { resolver: this.models },
			lifecycle: { consumers: [...patched.lifecycle.consumers, ...this.extraConsumers] },
		});
	}
}
