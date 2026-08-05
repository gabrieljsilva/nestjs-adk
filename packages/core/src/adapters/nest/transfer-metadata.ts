import { InvalidAgentMetadataError } from "./errors/invalid-agent-metadata.error";

/**
 * The `@TransfersTo` payload, validated on the way in.
 *
 * Targets are names rather than classes on purpose: two agents that hand work to each
 * other would be a circular import as classes, and the runtime resolves against a catalog
 * keyed by name anyway. An agent that never declared the decorator transfers to nobody,
 * which is the same thing as declaring an empty list.
 */
export class TransferMetadata {
	private constructor(public readonly targets: readonly string[]) {}

	public static none(): TransferMetadata {
		return new TransferMetadata([]);
	}

	public static from(value: unknown, providerName: string): TransferMetadata {
		if (value === undefined) return TransferMetadata.none();
		if (!Array.isArray(value)) {
			throw new InvalidAgentMetadataError(providerName, "@TransfersTo must declare a list of agent names.");
		}
		for (const target of value) {
			if (typeof target !== "string") {
				throw new InvalidAgentMetadataError(providerName, "@TransfersTo accepts agent names, not classes.");
			}
		}
		return new TransferMetadata(value.filter((target) => typeof target === "string"));
	}
}
