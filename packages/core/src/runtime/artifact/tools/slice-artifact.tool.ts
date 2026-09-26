import { ToolEffect } from "../../../domain/tool/approval/tool-effect.value-object";
import { ParsedArguments } from "../../../domain/tool/invocation/parsed-arguments.value-object";
import type { ToolContext } from "../../../domain/tool/invocation/tool-context.value-object";
import { ToolHandler } from "../../../domain/tool/invocation/tool-handler.contract";
import { RuntimeToolRequest } from "../../../domain/tool/runtime-tool-request.value-object";
import type { ToolDefinition } from "../../../domain/tool/tool-definition.value-object";
import { ToolSchema } from "../../../domain/tool/tool-schema.contract";
import type { ArtifactBudget } from "../artifact-budget.value-object";
import type { ArtifactLoader } from "../artifact-loader.service";
import { ArtifactRefusal } from "../artifact-refusal.value-object";
import { CsvTable } from "./csv-table.value-object";

const NAME = "slice_artifact";

const DESCRIPTION =
	"Reads a rectangle out of a CSV artifact: the rows between `fromRow` and `toRow` (1 is the first row under the header) and the `columns` named, or every column. " +
	"A slice, never a query: there is no filter and no expression. Call outline_artifact first to learn the column names and how many rows there are.";

const DEFAULT_ROWS = 50;
const MAX_ROWS = 500;
const MAX_COLUMNS = 50;

/**
 * Reads a rectangle out of a CSV artifact. List it in `@Agent({ tools })` for an agent that is
 * given tables.
 */
export class SliceArtifactTool {
	public static readonly NAME = NAME;

	private constructor() {}

	public static request(): RuntimeToolRequest {
		return new RuntimeToolRequest(NAME, DESCRIPTION, new SliceSchema(), ToolEffect.READ);
	}

	public static build(artifacts: ArtifactLoader, budget: ArtifactBudget): ToolDefinition {
		return SliceArtifactTool.request().boundTo(new SliceHandler(artifacts, budget));
	}
}

class SliceSchema extends ToolSchema {
	public declaration(): unknown {
		return {
			type: "object",
			properties: {
				artifactId: { type: "string", description: "The id shown in the artifact placeholder." },
				fromRow: {
					type: "integer",
					minimum: 1,
					description: "First row to read, counting from 1 under the header. Defaults to 1.",
				},
				toRow: {
					type: "integer",
					minimum: 1,
					description: `Last row to read, inclusive. Defaults to ${DEFAULT_ROWS} rows from \`fromRow\`, and never more than ${MAX_ROWS}.`,
				},
				columns: {
					type: "array",
					items: { type: "string" },
					maxItems: MAX_COLUMNS,
					description: "The column names to bring back, in this order. Leaving it out brings every column.",
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
		if (!isOptionalRow(record.fromRow)) return ParsedArguments.invalid("fromRow must be a whole number, from 1.");
		if (!isOptionalRow(record.toRow)) return ParsedArguments.invalid("toRow must be a whole number, from 1.");
		const columns = record.columns;
		if (columns !== undefined && columns !== null) {
			if (!Array.isArray(columns) || !columns.every((column) => typeof column === "string")) {
				return ParsedArguments.invalid("columns must be a list of column names.");
			}
			if (columns.length > MAX_COLUMNS) return ParsedArguments.invalid(`columns may name at most ${MAX_COLUMNS}.`);
		}
		const fromRow = readRow(record.fromRow) ?? 1;
		const toRow = Math.min(readRow(record.toRow) ?? fromRow + DEFAULT_ROWS - 1, fromRow + MAX_ROWS - 1);
		if (toRow < fromRow) return ParsedArguments.invalid("toRow must not be before fromRow.");
		return ParsedArguments.valid({
			artifactId: record.artifactId,
			fromRow,
			toRow,
			columns: Array.isArray(columns) ? columns : undefined,
		});
	}
}

class SliceHandler extends ToolHandler {
	public constructor(
		private readonly artifacts: ArtifactLoader,
		private readonly budget: ArtifactBudget,
	) {
		super();
	}

	public async invoke(args: Record<string, unknown>, context: ToolContext): Promise<unknown> {
		const loaded = await this.artifacts.loadOrRefuse(context.toSessionContext(), String(args.artifactId));
		if (loaded instanceof ArtifactRefusal) return loaded.toResult();
		const frame = { artifactId: loaded.reference.id.value };
		const table = CsvTable.fromText(loaded.content.text);
		if (table === undefined) {
			return {
				...frame,
				refused: true,
				reason: "the artifact does not read as a CSV table; use read_artifact or search_artifact.",
			};
		}
		const wanted = Array.isArray(args.columns) ? args.columns.map(String) : [...table.header];
		const missing = wanted.filter((name) => table.columnIndex(name) === -1);
		if (missing.length > 0) {
			return {
				...frame,
				refused: true,
				reason: `no column named ${missing.join(", ")}; the columns are ${table.header.join(", ")}.`,
			};
		}
		const fromRow = readRow(args.fromRow) ?? 1;
		const toRow = readRow(args.toRow) ?? fromRow + DEFAULT_ROWS - 1;
		const indices = wanted.map((name) => table.columnIndex(name));
		const rows = table.rows.slice(fromRow - 1, toRow).map((row) => indices.map((index) => row[index] ?? ""));
		return this.budget.fit(
			{ ...frame, columns: wanted, fromRow, toRow: Math.min(toRow, table.rowCount), totalRows: table.rowCount, rows },
			"rows",
		);
	}
}

function isOptionalRow(value: unknown): boolean {
	return value === undefined || value === null || readRow(value) !== undefined;
}

function readRow(value: unknown): number | undefined {
	if (typeof value !== "number" || !Number.isFinite(value) || value < 1) return undefined;
	return Math.trunc(value);
}
