import { ToolEffect } from "../../../domain/tool/approval/tool-effect.value-object";
import { ParsedArguments } from "../../../domain/tool/invocation/parsed-arguments.value-object";
import type { ToolContext } from "../../../domain/tool/invocation/tool-context.value-object";
import { ToolHandler } from "../../../domain/tool/invocation/tool-handler.contract";
import { ToolDefinition } from "../../../domain/tool/tool-definition.value-object";
import { ToolSchema } from "../../../domain/tool/tool-schema.contract";
import { ArtifactBudget } from "../artifact-budget.value-object";
import type { ArtifactLoader } from "../artifact-loader.service";
import { JsonOutline } from "./json-outline.service";
import { JsonPointer } from "./json-pointer.value-object";

const NAME = "query_artifact";

const DESCRIPTION =
	"Reads one value out of a JSON artifact by RFC 6901 JSON Pointer, such as `/orders/0/total`. " +
	"The empty pointer is the whole document. Pointers only: there are no filters and no expressions. " +
	"A value too large to return comes back as an outline of itself, which you then point deeper into.";

const OUTLINE_DEPTH = 2;

/**
 * One value, addressed rather than searched for.
 *
 * The query language is a JSON Pointer and nothing else, and the omission is the feature.
 * JSONPath filters are an expression language, and an expression language whose source is a
 * string the model wrote is evaluation of untrusted code inside the run. A pointer walks
 * names and indices: it cannot branch, match or compute, so a hostile one misses.
 *
 * A value that is itself too large comes back as its outline instead, with the pointer that
 * produced it, so the answer to "this is still too big" is another pointer rather than a
 * different tool.
 */
export class QueryArtifactTool {
	public static readonly NAME = NAME;

	private constructor() {}

	public static build(artifacts: ArtifactLoader, budget: ArtifactBudget): ToolDefinition {
		return new ToolDefinition(
			NAME,
			DESCRIPTION,
			new PointerSchema(),
			ToolEffect.READ,
			new PointerHandler(artifacts, budget),
			true,
		);
	}
}

class PointerSchema extends ToolSchema {
	public declaration(): unknown {
		return {
			type: "object",
			properties: {
				artifactId: { type: "string", description: "The id shown in the artifact placeholder." },
				pointer: {
					type: "string",
					description: "An RFC 6901 JSON Pointer, such as `/orders/0/total`. Empty means the whole document.",
				},
			},
			required: ["artifactId", "pointer"],
			additionalProperties: false,
		};
	}

	public parse(args: unknown): ParsedArguments {
		const record = typeof args === "object" && args !== null ? (args as Record<string, unknown>) : {};
		if (typeof record.artifactId !== "string" || record.artifactId.trim().length === 0) {
			return ParsedArguments.invalid("artifactId is required and must be a non empty string.");
		}
		if (typeof record.pointer !== "string") {
			return ParsedArguments.invalid("pointer is required and must be a string, empty for the whole document.");
		}
		if (JsonPointer.fromText(record.pointer) === undefined) {
			return ParsedArguments.invalid(
				"pointer must be an RFC 6901 JSON Pointer: empty, or starting with `/`, as in `/orders/0/total`.",
			);
		}
		return ParsedArguments.valid({ artifactId: record.artifactId, pointer: record.pointer });
	}
}

class PointerHandler extends ToolHandler {
	private readonly outline = new JsonOutline();

	public constructor(
		private readonly artifacts: ArtifactLoader,
		private readonly budget: ArtifactBudget,
	) {
		super();
	}

	public async invoke(args: Record<string, unknown>, context: ToolContext): Promise<unknown> {
		const loaded = await this.artifacts.loadOrFail(context.toSessionContext(), String(args.artifactId));
		const text = String(args.pointer);
		const pointer = JsonPointer.fromText(text);
		if (pointer === undefined) {
			return {
				artifactId: loaded.reference.id.value,
				pointer: text,
				refused: true,
				reason: "pointer is not an RFC 6901 JSON Pointer.",
			};
		}

		const value = pointer.resolve(loaded.readJsonOrFail());
		const frame = { artifactId: loaded.reference.id.value, pointer: text, found: value !== undefined };
		const answer = { ...frame, value: value ?? null, truncated: false };
		if (ArtifactBudget.measure(answer) <= this.budget.characters) return answer;
		return this.budget.fit({ ...frame, valueOutline: this.outline.build(value, OUTLINE_DEPTH) }, "valueOutline");
	}
}
