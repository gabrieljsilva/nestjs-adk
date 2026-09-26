import type { ArtifactStorage } from "../../contracts/storage/artifact-storage.contract";
import type { ArtifactReference } from "../../domain/artifact/artifact-reference.value-object";
import { CharacterCountOffloadPolicy } from "../../domain/artifact/character-count-offload.policy";
import type { OffloadPolicy } from "../../domain/artifact/offload.policy";
import { ToolEffect } from "../../domain/tool/approval/tool-effect.value-object";
import { ParsedArguments } from "../../domain/tool/invocation/parsed-arguments.value-object";
import type { ToolContext } from "../../domain/tool/invocation/tool-context.value-object";
import { ToolHandler } from "../../domain/tool/invocation/tool-handler.contract";
import { ToolDefinition } from "../../domain/tool/tool-definition.value-object";
import { ToolSchema } from "../../domain/tool/tool-schema.contract";
import { ArtifactBudget } from "./artifact-budget.value-object";
import { ArtifactLoader, type LoadedArtifact } from "./artifact-loader.service";
import { ArtifactPage } from "./artifact-page.value-object";
import { ArtifactRefusal } from "./artifact-refusal.value-object";

const NAME = "read_artifact";

const DESCRIPTION =
	"Reads back the content of an artifact: a file attached to the conversation, or a result that was too large to keep inline. " +
	"Use it with the id shown in a placeholder such as [artifact a-1, text/plain, 40000 characters, ...]. " +
	"Read by characters with `offset` and `limit`, or by lines with `fromLine` (1 is the first) and `lines`, which is how to follow up a line search_artifact reported. " +
	"The answer says the total length and whether anything is left after the page it gave you.";

const DEFAULT_LINES = 200;

export class ReadArtifactTool {
	public static readonly NAME = NAME;

	private constructor() {}

	public static forStorage(
		storage: ArtifactStorage,
		policy: OffloadPolicy = CharacterCountOffloadPolicy.byDefault(),
		budget: ArtifactBudget = ArtifactBudget.fromPolicy(policy),
	): ToolDefinition {
		const limit = ArtifactPage.resolveDefaultLimit(policy.thresholdCharacters);
		return new ToolDefinition(
			NAME,
			DESCRIPTION,
			new ArtifactPageSchema(limit),
			ToolEffect.READ,
			new ArtifactPageHandler(new ArtifactLoader(storage, budget.maxExplorableCharacters), limit, budget),
		);
	}
}

class ArtifactPageSchema extends ToolSchema {
	public constructor(private readonly defaultLimit: number) {
		super();
	}

	public declaration(): unknown {
		return {
			type: "object",
			properties: {
				artifactId: { type: "string", description: "The id shown in the artifact placeholder." },
				offset: {
					type: "integer",
					minimum: 0,
					description: "First character to read, counting from 0. Defaults to 0. Ignored when `fromLine` is given.",
				},
				limit: {
					type: "integer",
					minimum: 1,
					description: `How many characters to read. Defaults to ${this.defaultLimit}, which is the most the runtime keeps in a context.`,
				},
				fromLine: {
					type: "integer",
					minimum: 1,
					description: "First line to read, counting from 1. Reads by line instead of by character.",
				},
				lines: {
					type: "integer",
					minimum: 1,
					description: `How many lines to read from \`fromLine\`. Defaults to ${DEFAULT_LINES}, and never more than \`limit\` characters.`,
				},
			},
			required: ["artifactId"],
			additionalProperties: false,
		};
	}

	public parse(args: unknown): ParsedArguments {
		const record = typeof args === "object" && args !== null ? (args as Record<string, unknown>) : {};
		const artifactId = record.artifactId;
		if (typeof artifactId !== "string" || artifactId.trim().length === 0) {
			return ParsedArguments.invalid("artifactId is required and must be a non empty string.");
		}
		if (!isCount(record.offset)) return ParsedArguments.invalid("offset must be a whole number of characters, from 0.");
		if (!isCount(record.limit) || readCount(record.limit) === 0) {
			return ParsedArguments.invalid("limit must be a whole number of characters, from 1.");
		}
		if (!isCount(record.fromLine) || readCount(record.fromLine) === 0) {
			return ParsedArguments.invalid("fromLine must be a whole number of lines, from 1.");
		}
		if (!isCount(record.lines) || readCount(record.lines) === 0) {
			return ParsedArguments.invalid("lines must be a whole number of lines, from 1.");
		}
		const fromLine = readCount(record.fromLine);
		if (fromLine !== undefined) {
			return ParsedArguments.valid({
				artifactId,
				fromLine,
				lines: readCount(record.lines) ?? DEFAULT_LINES,
				limit: readCount(record.limit) ?? this.defaultLimit,
			});
		}
		return ParsedArguments.valid({
			artifactId,
			offset: readCount(record.offset) ?? 0,
			limit: readCount(record.limit) ?? this.defaultLimit,
		});
	}
}

class ArtifactPageHandler extends ToolHandler {
	public constructor(
		private readonly artifacts: ArtifactLoader,
		private readonly defaultLimit: number,
		private readonly budget: ArtifactBudget,
	) {
		super();
	}

	public async invoke(args: Record<string, unknown>, context: ToolContext): Promise<unknown> {
		const artifactId = String(args.artifactId);
		const limit = readCount(args.limit) ?? this.defaultLimit;
		const fromLine = readCount(args.fromLine);
		if (fromLine === undefined) {
			const range = await this.artifacts.loadRangeOrRefuse(
				context.toSessionContext(),
				artifactId,
				readCount(args.offset) ?? 0,
				limit,
			);
			if (range instanceof ArtifactRefusal) return range.toResult();
			return this.fit(range.reference, limit, (room) =>
				ArtifactPage.fromRange(range.text.slice(0, room), range.offset, range.reference.characters),
			);
		}
		const loaded = await this.artifacts.loadOrRefuse(context.toSessionContext(), artifactId);
		if (loaded instanceof ArtifactRefusal) return loaded.toResult();
		return this.readLines(loaded, fromLine, readCount(args.lines) ?? DEFAULT_LINES, limit);
	}

	private readLines(loaded: LoadedArtifact, fromLine: number, lines: number, limit: number): Record<string, unknown> {
		const byLine = this.fit(loaded.reference, limit, (room) =>
			ArtifactPage.fromLines(loaded.content, fromLine, lines, room),
		);
		if (this.fits(byLine)) return byLine;
		return this.fit(loaded.reference, limit, (room) => ArtifactPage.fromLineStart(loaded.content, fromLine, room));
	}

	private fit(
		reference: ArtifactReference,
		limit: number,
		build: (room: number) => ArtifactPage,
	): Record<string, unknown> {
		let page = build(limit);
		let result = page.toResult(reference);
		while (!this.fits(result)) {
			const over = ArtifactBudget.measure(result) - this.budget.characters;
			const smaller = build(Math.max(0, page.text.length - over));
			if (smaller.text.length >= page.text.length) return result;
			page = smaller;
			result = page.toResult(reference);
		}
		return result;
	}

	private fits(result: Record<string, unknown>): boolean {
		return ArtifactBudget.measure(result) <= this.budget.characters;
	}
}

function isCount(value: unknown): boolean {
	return value === undefined || value === null || readCount(value) !== undefined;
}

function readCount(value: unknown): number | undefined {
	if (typeof value !== "number" || !Number.isFinite(value) || value < 0) return undefined;
	return Math.trunc(value);
}
