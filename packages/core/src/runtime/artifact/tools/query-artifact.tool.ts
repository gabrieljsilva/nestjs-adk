import { ToolEffect } from "../../../domain/tool/approval/tool-effect.value-object";
import { ParsedArguments } from "../../../domain/tool/invocation/parsed-arguments.value-object";
import type { ToolContext } from "../../../domain/tool/invocation/tool-context.value-object";
import { ToolHandler } from "../../../domain/tool/invocation/tool-handler.contract";
import { RuntimeToolRequest } from "../../../domain/tool/runtime-tool-request.value-object";
import type { ToolDefinition } from "../../../domain/tool/tool-definition.value-object";
import { ToolSchema } from "../../../domain/tool/tool-schema.contract";
import { ArtifactBudget } from "../artifact-budget.value-object";
import type { ArtifactLoader } from "../artifact-loader.service";
import { ArtifactRefusal } from "../artifact-refusal.value-object";
import { JsonOutline } from "./json-outline.service";
import { JsonPointer } from "./json-pointer.value-object";

const NAME = "query_artifact";

const DESCRIPTION =
	"Reads one value out of a JSON artifact by RFC 6901 JSON Pointer, such as `/orders/0/total`. " +
	"The empty pointer is the whole document. Pointers only: there are no filters and no expressions. " +
	"A value too large to return comes back as an outline of itself, which you then point deeper into.";

const OUTLINE_DEPTH = 2;

/**
 * Reads one value out of a JSON artifact by JSON Pointer. List it in `@Agent({ tools })` for an
 * agent that is given JSON documents.
 */
export class QueryArtifactTool {
	public static readonly NAME = NAME;

	private constructor() {}

	public static request(): RuntimeToolRequest {
		return new RuntimeToolRequest(NAME, DESCRIPTION, new PointerSchema(), ToolEffect.READ);
	}

	public static build(artifacts: ArtifactLoader, budget: ArtifactBudget): ToolDefinition {
		return QueryArtifactTool.request().boundTo(new PointerHandler(artifacts, budget));
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
		const loaded = await this.artifacts.loadOrRefuse(context.toSessionContext(), String(args.artifactId));
		if (loaded instanceof ArtifactRefusal) return loaded.toResult();
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
