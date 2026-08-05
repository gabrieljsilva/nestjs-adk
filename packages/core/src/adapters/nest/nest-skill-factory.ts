import { SkillDefinition } from "../../domain/skill/skill-definition";
import { InvalidAgentMetadataError } from "./errors/invalid-agent-metadata.error";

/**
 * Turns a `@Skill` the consumer wrote into the definition a run composes with.
 *
 * The content is read once, at boot, by calling the method the decorator sits on. A skill
 * is knowledge and not a query: reading it per turn would make the stable prefix depend on
 * when it was read, and a cached prefix that moves is a cache that never hits.
 */
export class NestSkillFactory {
	public fromMethod(agent: object, method: string, metadata: unknown, providerName: string): SkillDefinition {
		if (typeof metadata !== "object" || metadata === null) {
			throw new InvalidAgentMetadataError(providerName, "@Skill metadata is not an object.");
		}
		const name = Reflect.get(metadata, "name");
		const description = Reflect.get(metadata, "description");
		if (typeof name !== "string") throw new InvalidAgentMetadataError(providerName, "@Skill needs a name.");
		if (typeof description !== "string") {
			throw new InvalidAgentMetadataError(providerName, `@Skill ${name} needs a description.`);
		}

		const content = this.contentOf(agent, method, name, providerName);
		return Reflect.get(metadata, "mode") === "always"
			? SkillDefinition.always(name, description, content)
			: SkillDefinition.onDemand(name, description, content);
	}

	private contentOf(agent: object, method: string, name: string, providerName: string): string {
		const entry = Reflect.get(agent, method);
		if (typeof entry !== "function") {
			throw new InvalidAgentMetadataError(providerName, `@Skill ${name} has no ${method}() to read.`);
		}
		const content: unknown = Reflect.apply(entry, agent, []);
		if (typeof content !== "string") {
			throw new InvalidAgentMetadataError(providerName, `@Skill ${name} must return its content as text.`);
		}
		return content;
	}
}
