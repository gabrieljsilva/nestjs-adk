import { NestAgentScanner } from "../../adapters/nest/nest-agent-scanner";
import { NestComponentDiscovery } from "../../adapters/nest/nest-component-discovery";
import type { ContainerProvider } from "../../adapters/nest/nest-provider-scan";
import { NestProviderScan } from "../../adapters/nest/nest-provider-scan";
import type { IdGenerator } from "../../common/identity/id-generator";
import type { Clock } from "../../common/time/clock";
import type { ArtifactStorage } from "../../contracts/artifact-storage";
import type { ModelResolver } from "../../contracts/model-resolver";
import type { SessionEventConsumer } from "../../contracts/session-event-consumer";
import type { SessionStorage } from "../../contracts/session-storage";
import type { LlmModel } from "../../domain/model/llm-model";
import { RuntimeOptions } from "../../runtime/composition/runtime-options";
import type { AdkRuntimeHost } from "../adk-runtime-host";
import type { AdkModuleOptions } from "./adk-module-options";
import { AgentBinder } from "./agent-binder";
import type { AgentRegistry } from "./agent-registry";

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
		private readonly scan: NestProviderScan = new NestProviderScan(),
		private readonly scanner: NestAgentScanner = new NestAgentScanner(),
		private readonly discovery: NestComponentDiscovery = new NestComponentDiscovery(),
	) {}

	/** Answers how many agent classes were bound, which is what a caller can assert on. */
	public async compose(providers: readonly ContainerProvider[]): Promise<number> {
		const scanned = this.scan.read(providers);
		const declared = this.discovery.discover(this.scanner.scan(scanned, this.defaultModel ?? this.options.defaultModel));

		await this.host.start(declared, this.storage, this.artifacts, this.clock, this.ids, this.declaredRuntime());
		return new AgentBinder(this.registry).bind(scanned);
	}

	/** The options' runtime, with the container's resolver and the appended consumers in place. */
	private declaredRuntime(): RuntimeOptions {
		const declared = this.options.runtime ?? new RuntimeOptions();
		return declared.with({
			models: this.models,
			consumers: [...declared.consumers, ...this.extraConsumers],
		});
	}
}
