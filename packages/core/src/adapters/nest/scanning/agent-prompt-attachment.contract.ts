import type { DiscoveredProvider } from "./nest-component-discovery.service";
import type { ScannedProvider } from "./scanned-provider.value-object";

/**
 * Attaches the builder of an agent that writes its prompt per run.
 *
 * It is a port and not a call because deciding what counts as an overridden `prompt()`
 * means knowing `AdkAgent`, which lives in the public layer: the adapter would have to
 * import the base class an application extends, and the dependency only runs one way. So
 * the scan declares the step it needs and the public layer supplies the half that knows.
 */
export abstract class AgentPromptAttachment {
	public abstract attach(
		discovered: readonly DiscoveredProvider[],
		scanned: readonly ScannedProvider[],
	): readonly DiscoveredProvider[];
}
