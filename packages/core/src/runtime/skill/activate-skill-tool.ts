import { ParsedArguments } from "../../domain/tool/parsed-arguments";
import { ToolDefinition } from "../../domain/tool/tool-definition";
import { ToolEffect } from "../../domain/tool/tool-effect";
import { ToolHandler } from "../../domain/tool/tool-handler";
import { ToolSchema } from "../../domain/tool/tool-schema";
import type { SkillCatalog } from "./skill-catalog";

const NAME = "activate_skill";

/**
 * The tool that loads a skill the model decided it needs.
 *
 * The content arrives as this tool's result, in the place the conversation had reached,
 * and is never copied to the front of the prompt. That is what keeps the stable prefix
 * stable: a skill loaded halfway through a session must not invalidate the cache of
 * everything before it.
 *
 * Reading a skill changes nothing, so it is a read: no approval policy should ever stop
 * a model from finding out what it is supposed to know.
 */
export class ActivateSkillTool {
	public static readonly NAME = NAME;

	private constructor() {}

	public static forCatalog(catalog: SkillCatalog): ToolDefinition {
		return new ToolDefinition(
			NAME,
			`Loads the full content of one of the available skills. Available: ${catalog.describe()}`,
			new SkillNameSchema(catalog),
			ToolEffect.READ,
			new SkillContentHandler(catalog),
		);
	}
}

/** Accepts only the name of a skill this agent actually has. */
class SkillNameSchema extends ToolSchema {
	public constructor(private readonly catalog: SkillCatalog) {
		super();
	}

	public declaration(): unknown {
		return {
			type: "object",
			properties: {
				skillName: {
					type: "string",
					enum: this.catalog.onDemand.map((skill) => skill.name),
					description: "The name of the skill to load.",
				},
			},
			required: ["skillName"],
			additionalProperties: false,
		};
	}

	public parse(args: unknown): ParsedArguments {
		const name = typeof args === "object" && args !== null ? Reflect.get(args, "skillName") : undefined;
		if (typeof name !== "string") return ParsedArguments.invalid("skillName is required and must be a string.");
		if (this.catalog.find(name) === undefined) {
			return ParsedArguments.invalid(`no loadable skill is named ${name}; available: ${this.catalog.describe()}`);
		}
		return ParsedArguments.valid({ skillName: name });
	}
}

class SkillContentHandler extends ToolHandler {
	public constructor(private readonly catalog: SkillCatalog) {
		super();
	}

	public async invoke(args: Record<string, unknown>): Promise<unknown> {
		const name = String(args.skillName);
		return this.catalog.find(name)?.content ?? "";
	}
}
