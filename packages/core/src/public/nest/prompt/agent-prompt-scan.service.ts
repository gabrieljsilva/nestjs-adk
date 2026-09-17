import { AgentPromptAttachment } from "../../../adapters/nest/scanning/agent-prompt-attachment.contract";
import type { DiscoveredProvider } from "../../../adapters/nest/scanning/nest-component-discovery.service";
import type { ScannedProvider } from "../../../adapters/nest/scanning/scanned-provider.value-object";
import { AmbiguousAgentPromptError } from "../errors/ambiguous-agent-prompt.error";
import { MethodPromptBuilder } from "./method-prompt-builder.adapter";

export class AgentPromptScan extends AgentPromptAttachment {
	public attach(
		discovered: readonly DiscoveredProvider[],
		scanned: readonly ScannedProvider[],
	): readonly DiscoveredProvider[] {
		const instances = new Map(scanned.map((provider) => [provider.name, provider.instance]));
		return discovered.map((provider) => {
			const builder = MethodPromptBuilder.forInstance(instances.get(provider.providerName));
			if (builder === undefined) return provider;
			if (provider.instructions !== undefined) throw new AmbiguousAgentPromptError(provider.providerName);
			return { ...provider, promptBuilder: builder };
		});
	}
}
