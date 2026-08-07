import type { DiscoveredProvider } from "../../adapters/nest/nest-component-discovery";
import type { ScannedProvider } from "../../adapters/nest/scanned-provider";
import { AmbiguousAgentPromptError } from "./errors/ambiguous-agent-prompt.error";
import { MethodPromptBuilder } from "./method-prompt-builder";

/**
 * Reads which agents build their prompt per run, and attaches the builder that does it.
 *
 * It runs between the decorator scan and the discovery that turns providers into
 * definitions, because that is the only point where both halves exist: what the decorator
 * declared, and the instance whose method would override it.
 *
 * This is the public layer's job rather than the Nest adapter's, because deciding what
 * counts as an overridden `prompt()` means knowing `AdkAgent`, and the adapter is not
 * allowed to know the base class an application extends.
 */
export class AgentPromptScan {
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
