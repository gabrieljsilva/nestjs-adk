import { AgentTargets } from "../agent-targets.service";
import { InvalidAgentMetadataError } from "../errors/invalid-agent-metadata.error";

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
		return new TransferMetadata(AgentTargets.readNames(value, providerName, "@TransfersTo"));
	}
}
