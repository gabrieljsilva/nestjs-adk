import { AGENT_METADATA } from "../../../adapters/nest/metadata/metadata-keys.token";
import type { ScannedProvider } from "../../../adapters/nest/scanning/scanned-provider.value-object";
import type { AgentPrompting } from "../prompt/agent-prompting.service";
import { AdkAgent } from "./adk-agent.edge";
import type { AgentRegistry } from "./agent-registry.service";

export class AgentBinder {
	public constructor(
		private readonly registry: AgentRegistry,
		private readonly prompting?: AgentPrompting,
	) {}

	public bind(providers: readonly ScannedProvider[]): number {
		let bound = 0;
		for (const provider of providers) {
			const name = this.findName(provider);
			if (name === undefined || !(provider.instance instanceof AdkAgent)) continue;
			provider.instance.bindTo(this.registry.open(name), this.prompting);
			bound += 1;
		}
		return bound;
	}

	private findName(provider: ScannedProvider): string | undefined {
		const metadata: unknown = Reflect.getMetadata(AGENT_METADATA, provider.type);
		if (typeof metadata !== "object" || metadata === null) return undefined;
		const name = Reflect.get(metadata, "name");
		return typeof name === "string" && name.length > 0 ? name : undefined;
	}
}
