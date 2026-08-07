import { AgentTargets } from "./agent-targets";
import { InvalidAgentMetadataError } from "./errors/invalid-agent-metadata.error";

/**
 * The `@DelegatesTo` payload, resolved to names on the way in.
 * Same shape and same reasons as the transfer one: a name, a class or a function returning
 * one, and an absent decorator means an agent that delegates to nobody.
 */
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
		return new DelegationMetadata(AgentTargets.namesOf(value, providerName, "@DelegatesTo"));
	}
}
