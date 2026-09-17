import { InvalidAgentMetadataError } from "../errors/invalid-agent-metadata.error";

export class McpControllerMetadata {
	private constructor(public readonly tools: readonly unknown[]) {}

	public static from(value: unknown, providerName: string): McpControllerMetadata {
		if (typeof value !== "object" || value === null) {
			throw new InvalidAgentMetadataError(providerName, "@McpController metadata is not an object.");
		}
		const tools = Reflect.get(value, "tools");
		if (tools === undefined) return new McpControllerMetadata([]);
		if (!Array.isArray(tools)) throw new InvalidAgentMetadataError(providerName, "@McpController tools is not a list.");
		return new McpControllerMetadata([...tools]);
	}
}
