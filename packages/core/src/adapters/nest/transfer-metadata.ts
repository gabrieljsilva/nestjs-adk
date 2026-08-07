import { AgentTargets } from "./agent-targets";
import { InvalidAgentMetadataError } from "./errors/invalid-agent-metadata.error";

/**
 * The `@TransfersTo` payload, resolved to names on the way in.
 *
 * A target reaches here as a name, as the class that declares the agent, or as a function
 * returning that class, and leaves as the name the catalog is keyed by. An agent that never
 * declared the decorator transfers to nobody, which is the same thing as declaring an empty
 * list.
 */
export class TransferMetadata {
	private constructor(public readonly targets: readonly string[]) {}

	public static none(): TransferMetadata {
		return new TransferMetadata([]);
	}

	public static from(value: unknown, providerName: string): TransferMetadata {
		if (value === undefined) return TransferMetadata.none();
		if (!Array.isArray(value)) {
			throw new InvalidAgentMetadataError(providerName, "@TransfersTo must declare a list of targets.");
		}
		return new TransferMetadata(AgentTargets.namesOf(value, providerName, "@TransfersTo"));
	}
}
