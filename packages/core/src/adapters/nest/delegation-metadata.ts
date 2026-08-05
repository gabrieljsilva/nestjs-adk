import { InvalidAgentMetadataError } from "./errors/invalid-agent-metadata.error";

/**
 * The `@DelegatesTo` payload, validated on the way in.
 * Same shape and same reasons as the transfer one: names rather than classes, and an
 * absent decorator means an agent that delegates to nobody.
 */
export class DelegationMetadata {
	private constructor(public readonly targets: readonly string[]) {}

	public static none(): DelegationMetadata {
		return new DelegationMetadata([]);
	}

	public static from(value: unknown, providerName: string): DelegationMetadata {
		if (value === undefined) return DelegationMetadata.none();
		if (!Array.isArray(value)) {
			throw new InvalidAgentMetadataError(providerName, "@DelegatesTo must declare a list of agent names.");
		}
		for (const target of value) {
			if (typeof target !== "string") {
				throw new InvalidAgentMetadataError(providerName, "@DelegatesTo accepts agent names, not classes.");
			}
		}
		return new DelegationMetadata(value.filter((target) => typeof target === "string"));
	}
}
