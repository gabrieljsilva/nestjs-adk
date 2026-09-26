import { ToolEffect } from "../../../domain/tool/approval/tool-effect.value-object";
import { ParsedArguments } from "../../../domain/tool/invocation/parsed-arguments.value-object";
import type { ToolContext } from "../../../domain/tool/invocation/tool-context.value-object";
import { ToolHandler } from "../../../domain/tool/invocation/tool-handler.contract";
import { RuntimeToolRequest } from "../../../domain/tool/runtime-tool-request.value-object";
import type { ToolDefinition } from "../../../domain/tool/tool-definition.value-object";
import { ToolSchema } from "../../../domain/tool/tool-schema.contract";
import { ArtifactBudget } from "../artifact-budget.value-object";
import type { ArtifactLoader, LoadedArtifact } from "../artifact-loader.service";
import { ArtifactRefusal } from "../artifact-refusal.value-object";
import { CsvOutline } from "./csv-outline.service";
import { CsvTable } from "./csv-table.value-object";
import { JsonOutline } from "./json-outline.service";
import { MarkdownOutline } from "./markdown-outline.service";

const NAME = "outline_artifact";

const DESCRIPTION =
	"Describes the shape of an artifact without reading it. For JSON, the keys, the types and the length of every array, " +
	"down to `depth` levels (2 by default). For a CSV, the columns with a type and a sample, and how many rows. For Markdown, the headings with their line. " +
	"For other text, how many lines and characters it has and how it starts. " +
	"Call it first: it is what tells you which pointer to ask query_artifact for, which rows to slice, or what to search for.";

const DEFAULT_DEPTH = 2;
const MAX_DEPTH = 6;
const FIRST_LINES = 10;

/**
 * Describes the shape of an artifact without reading it. List it in `@Agent({ tools })` for any
 * agent that explores files: it is the call the other exploration tools are written after.
 */
export class OutlineArtifactTool {
	public static readonly NAME = NAME;

	private constructor() {}

	public static request(): RuntimeToolRequest {
		return new RuntimeToolRequest(NAME, DESCRIPTION, new OutlineSchema(), ToolEffect.READ);
	}

	public static build(artifacts: ArtifactLoader, budget: ArtifactBudget): ToolDefinition {
		return OutlineArtifactTool.request().boundTo(new OutlineHandler(artifacts, budget));
	}
}

class OutlineSchema extends ToolSchema {
	public declaration(): unknown {
		return {
			type: "object",
			properties: {
				artifactId: { type: "string", description: "The id shown in the artifact placeholder." },
				depth: {
					type: "integer",
					minimum: 0,
					maximum: MAX_DEPTH,
					description: `How many levels of a JSON document to open. Defaults to ${DEFAULT_DEPTH}.`,
				},
			},
			required: ["artifactId"],
			additionalProperties: false,
		};
	}

	public parse(args: unknown): ParsedArguments {
		const record = typeof args === "object" && args !== null ? (args as Record<string, unknown>) : {};
		if (typeof record.artifactId !== "string" || record.artifactId.trim().length === 0) {
			return ParsedArguments.invalid("artifactId is required and must be a non empty string.");
		}
		const depth = record.depth;
		if (depth !== undefined && depth !== null && (typeof depth !== "number" || !Number.isFinite(depth) || depth < 0)) {
			return ParsedArguments.invalid("depth must be a whole number of levels, from 0.");
		}
		return ParsedArguments.valid({ artifactId: record.artifactId, depth: readDepth(depth) });
	}
}

class OutlineHandler extends ToolHandler {
	private readonly json = new JsonOutline();
	private readonly csv = new CsvOutline();
	private readonly markdown = new MarkdownOutline();

	public constructor(
		private readonly artifacts: ArtifactLoader,
		private readonly budget: ArtifactBudget,
	) {
		super();
	}

	public async invoke(args: Record<string, unknown>, context: ToolContext): Promise<unknown> {
		const loaded = await this.artifacts.loadOrRefuse(context.toSessionContext(), String(args.artifactId));
		if (loaded instanceof ArtifactRefusal) return loaded.toResult();
		const frame = {
			artifactId: loaded.reference.id.value,
			name: loaded.reference.name?.value,
			mediaType: loaded.reference.mediaType,
			totalCharacters: loaded.content.characters,
		};
		const parsed = this.tryReadJson(loaded);
		if (parsed.isJson) {
			return this.budget.fit(
				{ ...frame, kind: "json", outline: this.fitDepth(parsed.value, readDepth(args.depth)) },
				"outline",
			);
		}
		const text = loaded.content.text;
		const table = CsvTable.fromText(text);
		if (table !== undefined) return this.budget.fit({ ...frame, kind: "csv", ...this.csv.build(table) }, "columns");
		if (this.markdown.isMarkdown(text)) {
			return this.budget.fit({ ...frame, kind: "markdown", ...this.markdown.build(text) }, "headings");
		}
		return this.budget.fit({ ...frame, kind: "text", ...measureText(text) }, "firstLines");
	}

	private fitDepth(value: unknown, depth: number): unknown {
		for (let level = depth; level > 0; level -= 1) {
			const built = this.json.build(value, level);
			if (ArtifactBudget.measure({ outline: built }) <= this.budget.characters) return built;
		}
		return this.json.build(value, 0);
	}

	private tryReadJson(loaded: LoadedArtifact): { isJson: boolean; value: unknown } {
		try {
			return { isJson: true, value: JSON.parse(loaded.content.text) };
		} catch {
			return { isJson: false, value: undefined };
		}
	}
}

function readDepth(value: unknown): number {
	if (typeof value !== "number" || !Number.isFinite(value) || value < 0) return DEFAULT_DEPTH;
	return Math.min(MAX_DEPTH, Math.trunc(value));
}

function measureText(text: string): Record<string, unknown> {
	const lines = text.split("\n");
	return {
		lines: lines.length,
		characters: text.length,
		bytes: new TextEncoder().encode(text).length,
		firstLines: lines.slice(0, FIRST_LINES),
	};
}
