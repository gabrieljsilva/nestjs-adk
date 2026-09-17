import { ToolEffect } from "../../../domain/tool/approval/tool-effect.value-object";
import { ParsedArguments } from "../../../domain/tool/invocation/parsed-arguments.value-object";
import type { ToolContext } from "../../../domain/tool/invocation/tool-context.value-object";
import { ToolHandler } from "../../../domain/tool/invocation/tool-handler.contract";
import { ToolDefinition } from "../../../domain/tool/tool-definition.value-object";
import { ToolSchema } from "../../../domain/tool/tool-schema.contract";
import type { ArtifactBudget } from "../artifact-budget.value-object";
import type { ArtifactLoader } from "../artifact-loader.service";
import { RegexGuard, RejectedPattern } from "./regex-guard.service";

const NAME = "search_artifact";

const DESCRIPTION =
	"Finds where something appears in an artifact, without reading the artifact. `query` is a literal string. " +
	"Set `regex: true` to read it as a regular expression instead; simple patterns only, and one that could backtrack is refused. " +
	"Each match comes back with the line it is on and the characters around it, so you can then read that part with read_artifact.";

const DEFAULT_MAX_MATCHES = 20;
const MAX_MATCHES = 100;
const DEFAULT_CONTEXT = 80;
const MAX_CONTEXT = 400;

export class SearchArtifactTool {
	public static readonly NAME = NAME;

	private constructor() {}

	public static build(artifacts: ArtifactLoader, budget: ArtifactBudget): ToolDefinition {
		return new ToolDefinition(
			NAME,
			DESCRIPTION,
			new SearchSchema(),
			ToolEffect.READ,
			new SearchHandler(artifacts, budget),
			true,
		);
	}
}

class SearchSchema extends ToolSchema {
	public declaration(): unknown {
		return {
			type: "object",
			properties: {
				artifactId: { type: "string", description: "The id shown in the artifact placeholder." },
				query: { type: "string", description: "The text to look for, literally unless `regex` is true." },
				regex: { type: "boolean", description: "Read `query` as a regular expression. Defaults to false." },
				maxMatches: {
					type: "integer",
					minimum: 1,
					maximum: MAX_MATCHES,
					description: `How many matches to bring back. Defaults to ${DEFAULT_MAX_MATCHES}.`,
				},
				context: {
					type: "integer",
					minimum: 0,
					maximum: MAX_CONTEXT,
					description: `How many characters to show on each side of a match. Defaults to ${DEFAULT_CONTEXT}.`,
				},
			},
			required: ["artifactId", "query"],
			additionalProperties: false,
		};
	}

	public parse(args: unknown): ParsedArguments {
		const record = typeof args === "object" && args !== null ? (args as Record<string, unknown>) : {};
		if (typeof record.artifactId !== "string" || record.artifactId.trim().length === 0) {
			return ParsedArguments.invalid("artifactId is required and must be a non empty string.");
		}
		if (typeof record.query !== "string" || record.query.length === 0) {
			return ParsedArguments.invalid("query is required and must be a non empty string.");
		}
		if (record.regex !== undefined && record.regex !== null && typeof record.regex !== "boolean") {
			return ParsedArguments.invalid("regex must be true or false.");
		}
		return ParsedArguments.valid({
			artifactId: record.artifactId,
			query: record.query,
			regex: record.regex === true,
			maxMatches: Math.max(1, readBounded(record.maxMatches, DEFAULT_MAX_MATCHES, MAX_MATCHES)),
			context: readBounded(record.context, DEFAULT_CONTEXT, MAX_CONTEXT),
		});
	}
}

class SearchHandler extends ToolHandler {
	private readonly guard = new RegexGuard();

	public constructor(
		private readonly artifacts: ArtifactLoader,
		private readonly budget: ArtifactBudget,
	) {
		super();
	}

	public async invoke(args: Record<string, unknown>, context: ToolContext): Promise<unknown> {
		const loaded = await this.artifacts.loadOrFail(context.toSessionContext(), String(args.artifactId));
		const query = String(args.query);
		const isRegex = args.regex === true;
		const frame = { artifactId: loaded.reference.id.value, query, isRegex };

		const offsets = isRegex ? this.findByPattern(loaded.content.text, query) : findByText(loaded.content.text, query);
		if (offsets instanceof RejectedPattern) return { ...frame, refused: true, reason: offsets.reason, matches: [] };

		const maxMatches = Math.max(1, readBounded(args.maxMatches, DEFAULT_MAX_MATCHES, MAX_MATCHES));
		const around = readBounded(args.context, DEFAULT_CONTEXT, MAX_CONTEXT);
		const matches = offsets
			.slice(0, maxMatches)
			.map((match) => describeMatch(loaded.content.text, match.offset, match.length, around));
		return this.budget.fit({ ...frame, totalMatches: offsets.length, matches }, "matches");
	}

	private findByPattern(text: string, pattern: string): Match[] | RejectedPattern {
		const built = this.guard.build(pattern);
		if (built instanceof RejectedPattern) return built;
		const found: Match[] = [];
		for (const match of text.matchAll(built)) {
			if (found.length >= MAX_MATCHES) break;
			found.push(new Match(match.index ?? 0, Math.max(1, match[0].length)));
		}
		return found;
	}
}

class Match {
	public constructor(
		public readonly offset: number,
		public readonly length: number,
	) {}
}

function findByText(text: string, query: string): Match[] {
	const found: Match[] = [];
	let at = text.indexOf(query);
	while (at !== -1 && found.length < MAX_MATCHES) {
		found.push(new Match(at, query.length));
		at = text.indexOf(query, at + Math.max(1, query.length));
	}
	return found;
}

function describeMatch(text: string, offset: number, length: number, around: number): Record<string, unknown> {
	const start = Math.max(0, offset - around);
	return {
		offset,
		line: text.slice(0, offset).split("\n").length,
		excerpt: text.slice(start, offset + length + around),
		excerptOffset: start,
	};
}

function readBounded(value: unknown, fallback: number, ceiling: number): number {
	if (typeof value !== "number" || !Number.isFinite(value) || value < 0) return fallback;
	return Math.min(ceiling, Math.trunc(value));
}
