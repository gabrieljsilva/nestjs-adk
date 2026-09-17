import { SkillDefinition } from "../../../domain/skill/skill-definition.value-object";
import { InvalidAgentMetadataError } from "../errors/invalid-agent-metadata.error";

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

		const content = this.readContent(agent, method, name, providerName);
		return Reflect.get(metadata, "mode") === "always"
			? SkillDefinition.always(name, description, content)
			: SkillDefinition.onDemand(name, description, content);
	}

	private readContent(agent: object, method: string, name: string, providerName: string): string {
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
