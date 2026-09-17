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

export class NestScanService {
	public constructor(
		private readonly prompts: AgentPromptAttachment,
		private readonly providers: NestProviderScan = new NestProviderScan(),
		private readonly agents: NestAgentScanner = new NestAgentScanner(),
		private readonly discovery: NestComponentDiscovery = new NestComponentDiscovery(),
		private readonly controllers: NestControllerScanner = new NestControllerScanner(),
	) {}

	public readProviders(providers: readonly ContainerProvider[]): readonly ScannedProvider[] {
		return this.providers.read(providers);
	}

	public readSharedTools(scanned: readonly ScannedProvider[]): ReadonlyMap<unknown, ToolDefinition> {
		return this.agents.sharedTools(scanned);
	}

	public readAgents(
		scanned: readonly ScannedProvider[],
		defaultModel: LlmModel | undefined,
		shared: ReadonlyMap<unknown, ToolDefinition>,
	): readonly DeclaredAgent[] {
		const discovered = this.agents.scan(scanned, defaultModel, new Map(shared));
		return this.discovery.discover(this.prompts.attach(discovered, scanned));
	}

	public readExposedTools(
		scanned: readonly ScannedProvider[],
		shared: ReadonlyMap<unknown, ToolDefinition>,
	): readonly ToolDefinition[] {
		return this.controllers.scan(scanned, new Map(shared));
	}
}
