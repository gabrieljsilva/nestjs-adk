import { InvalidAgentMetadataError } from "./errors/invalid-agent-metadata.error";

/**
 * The decorator payload, validated on the way in.
 * Reflect metadata is `unknown` by definition, so it is checked here and never
 * travels further as a loose record.
 */
export class AgentMetadata {
	private constructor(
		public readonly name: string,
		public readonly description: string,
	) {}

	public static from(value: unknown, providerName: string): AgentMetadata {
		if (typeof value !== "object" || value === null) {
			throw new InvalidAgentMetadataError(providerName, "metadata is not an object.");
		}
		if (Reflect.get(value, "subAgents") !== undefined) {
			throw new InvalidAgentMetadataError(
				providerName,
				"subAgents is no longer part of @Agent: declare the handovers this agent may make with @TransfersTo('other-agent') instead.",
			);
		}
		const name = Reflect.get(value, "name");
		const description = Reflect.get(value, "description");
		if (typeof name !== "string") throw new InvalidAgentMetadataError(providerName, "name is missing.");
		if (typeof description !== "string") {
			throw new InvalidAgentMetadataError(providerName, "description is missing.");
		}
		return new AgentMetadata(name, description);
	}
}
