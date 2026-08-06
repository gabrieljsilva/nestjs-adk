import { AGENT_METADATA } from "../../adapters/nest/metadata-keys";
import { NotAnAgentClassError } from "./errors/not-an-agent-class.error";

/**
 * What `@Agent` wrote on a class, read back without the container.
 *
 * This is how something outside the module, a test bed being the usual caller, turns the
 * class an application passes around into the name the runtime knows the agent by. It
 * reads metadata only: whether the class is registered, composed or bound is not its
 * question.
 */
export class AgentMetadata {
	private constructor(
		public readonly name: string,
		public readonly description: string,
	) {}

	public static find(type: unknown): AgentMetadata | undefined {
		if (typeof type !== "function") return undefined;
		const metadata: unknown = Reflect.getMetadata(AGENT_METADATA, type);
		if (typeof metadata !== "object" || metadata === null) return undefined;
		const name = Reflect.get(metadata, "name");
		const description = Reflect.get(metadata, "description");
		if (typeof name !== "string" || typeof description !== "string") return undefined;
		return new AgentMetadata(name, description);
	}

	public static findOrFail(type: unknown): AgentMetadata {
		const declaration = AgentMetadata.find(type);
		if (declaration === undefined) throw new NotAnAgentClassError(AgentMetadata.candidateName(type));
		return declaration;
	}

	private static candidateName(type: unknown): string {
		const name = typeof type === "function" ? Reflect.get(type, "name") : undefined;
		return typeof name === "string" && name.length > 0 ? name : String(type);
	}
}
