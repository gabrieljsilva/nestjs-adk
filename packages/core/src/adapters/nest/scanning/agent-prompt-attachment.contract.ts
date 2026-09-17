import type { DiscoveredProvider } from "./nest-component-discovery.service";
import type { ScannedProvider } from "./scanned-provider.value-object";

export abstract class AgentPromptAttachment {
	public abstract attach(
		discovered: readonly DiscoveredProvider[],
		scanned: readonly ScannedProvider[],
	): readonly DiscoveredProvider[];
}
