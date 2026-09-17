import { ToolEffect } from "../../domain/tool/approval/tool-effect.value-object";
import { ParsedArguments } from "../../domain/tool/invocation/parsed-arguments.value-object";
import { ToolHandler } from "../../domain/tool/invocation/tool-handler.contract";
import { ToolDefinition } from "../../domain/tool/tool-definition.value-object";
import { ToolSchema } from "../../domain/tool/tool-schema.contract";
import type { SkillCatalog } from "./skill-catalog.service";

const NAME = "activate_skill";

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
