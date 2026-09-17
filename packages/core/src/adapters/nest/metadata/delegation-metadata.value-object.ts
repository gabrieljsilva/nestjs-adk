import { AgentTargets } from "../agent-targets.service";
import { InvalidAgentMetadataError } from "../errors/invalid-agent-metadata.error";

export class DelegationMetadata {
	private constructor(public readonly targets: readonly string[]) {}

	public static none(): DelegationMetadata {
		return new DelegationMetadata([]);
	}

	public static from(value: unknown, providerName: string): DelegationMetadata {
		if (value === undefined) return DelegationMetadata.none();
		if (!Array.isArray(value)) {
			throw new InvalidAgentMetadataError(providerName, "@DelegatesTo must declare a list of targets.");
		}
		return new DelegationMetadata(AgentTargets.readNames(value, providerName, "@DelegatesTo"));
	}
}
