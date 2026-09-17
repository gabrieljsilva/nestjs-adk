import type { DeclaredAgent } from "../../../domain/agent/declared-agent.value-object";
import type { LlmModel } from "../../../domain/model/llm-model.contract";
import type { ToolDefinition } from "../../../domain/tool/tool-definition.value-object";
import type { AgentPromptAttachment } from "./agent-prompt-attachment.contract";
import { NestAgentScanner } from "./nest-agent-scanner.service";
import { NestComponentDiscovery } from "./nest-component-discovery.service";
import { NestControllerScanner } from "./nest-controller-scanner.service";
import type { ContainerProvider } from "./nest-provider-scan.service";
import { NestProviderScan } from "./nest-provider-scan.service";
import type { ScannedProvider } from "./scanned-provider.value-object";

/**
 * The one door onto reading a finished NestJS container.
 *
 * Five collaborators read five different things off the same providers, and every caller
 * of them had to know the order to call them in: what the decorators declared, then the
 * prompt builders, then the definitions. That order is knowledge about scanning, so it
 * lives here, and the five stay as private collaborators because each one changes for its
 * own reason.
 *
 * Nothing here constructs or resolves anything. NestJS has already built every provider by
 * the time this runs, which is why it runs from a lifecycle hook; see
 * `.knowledge/nest-composition-timing.md`.
 */
export class NestScanService {
	public constructor(
		private readonly prompts: AgentPromptAttachment,
		private readonly providers: NestProviderScan = new NestProviderScan(),
		private readonly agents: NestAgentScanner = new NestAgentScanner(),
		private readonly discovery: NestComponentDiscovery = new NestComponentDiscovery(),
		private readonly controllers: NestControllerScanner = new NestControllerScanner(),
	) {}

	/** Everything in the container whose declaration can be read, instances included. */
	public readProviders(providers: readonly ContainerProvider[]): readonly ScannedProvider[] {
		return this.providers.read(providers);
	}

	/** Tools with a provider of their own, keyed by the class an agent lists in `tools`. */
	public readSharedTools(scanned: readonly ScannedProvider[]): ReadonlyMap<unknown, ToolDefinition> {
		return this.agents.sharedTools(scanned);
	}

	/** Every `@Agent` in the container, as the definitions a runtime is composed from. */
	public readAgents(
		scanned: readonly ScannedProvider[],
		defaultModel: LlmModel | undefined,
		shared: ReadonlyMap<unknown, ToolDefinition>,
	): readonly DeclaredAgent[] {
		const discovered = this.agents.scan(scanned, defaultModel, new Map(shared));
		return this.discovery.discover(this.prompts.attach(discovered, scanned));
	}

	/** What `@McpController` classes published, for a server to expose. */
	public readExposedTools(
		scanned: readonly ScannedProvider[],
		shared: ReadonlyMap<unknown, ToolDefinition>,
	): readonly ToolDefinition[] {
		return this.controllers.scan(scanned, new Map(shared));
	}
}
