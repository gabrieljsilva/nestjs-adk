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
import { RegexGuard, RejectedPattern } from "./regex-guard.service";

const NAME = "search_artifact";

const DESCRIPTION =
	"Finds where something appears in an artifact, without reading the artifact. `query` is a literal string, matched exactly unless `caseSensitive` is false. " +
	"Set `regex: true` to read it as a regular expression instead; simple patterns only, and one that could backtrack is refused. " +
	"`mode` picks the answer: `excerpts` (the default) gives each match with the characters around it, `lines` gives the whole line of each match, `count` gives only how many. " +
	"Every match names its line, so you can then read that part with read_artifact(fromLine).";

const DEFAULT_MAX_MATCHES = 20;
const MAX_MATCHES = 100;
const MAX_COUNTED_MATCHES = 10_000;
const DEFAULT_CONTEXT = 80;
const MAX_CONTEXT = 400;
const MODES: readonly string[] = ["excerpts", "lines", "count"];

/**
 * Finds where something appears in an artifact. List it in `@Agent({ tools })` for an agent that
 * is given text it has to locate something inside of rather than read from the top.
 */
export class SearchArtifactTool {
	public static readonly NAME = NAME;
	public static readonly MAX_COUNTED_MATCHES = MAX_COUNTED_MATCHES;

	private constructor() {}

	public static request(): RuntimeToolRequest {
		return new RuntimeToolRequest(NAME, DESCRIPTION, new SearchSchema(), ToolEffect.READ);
	}

	public static build(artifacts: ArtifactLoader, budget: ArtifactBudget): ToolDefinition {
		return SearchArtifactTool.request().boundTo(new SearchHandler(artifacts, budget));
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
				caseSensitive: {
					type: "boolean",
					description: "Match letters exactly as written. Defaults to true; false finds `Error` with `error`.",
				},
				mode: {
					type: "string",
					enum: [...MODES],
					description:
						"`excerpts` with the characters around each match, `lines` with the whole line, or `count` alone. Defaults to excerpts.",
				},
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
					description: `How many characters to show on each side of a match, in excerpts mode. Defaults to ${DEFAULT_CONTEXT}.`,
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
		if (!isOptionalBoolean(record.regex)) return ParsedArguments.invalid("regex must be true or false.");
		if (!isOptionalBoolean(record.caseSensitive)) return ParsedArguments.invalid("caseSensitive must be true or false.");
		if (record.mode !== undefined && record.mode !== null && !MODES.includes(String(record.mode))) {
			return ParsedArguments.invalid(`mode must be one of ${MODES.join(", ")}.`);
		}
		return ParsedArguments.valid({
			artifactId: record.artifactId,
			query: record.query,
			regex: record.regex === true,
			caseSensitive: record.caseSensitive !== false,
			mode: readMode(record.mode),
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
		const loaded = await this.artifacts.loadOrRefuse(context.toSessionContext(), String(args.artifactId));
		if (loaded instanceof ArtifactRefusal) return loaded.toResult();
		const query = String(args.query);
		const isRegex = args.regex === true;
		const caseSensitive = args.caseSensitive !== false;
		const mode = readMode(args.mode);
		const frame = { artifactId: loaded.reference.id.value, query, isRegex, caseSensitive, mode };

		const text = loaded.content.text;
		const found = isRegex ? this.findByPattern(text, query, caseSensitive) : findByText(text, query, caseSensitive);
		if (found instanceof RejectedPattern) return { ...frame, refused: true, reason: found.reason, matches: [] };

		const counted = { totalMatches: found.length, countStopped: found.length >= MAX_COUNTED_MATCHES };
		if (mode === "count") return { ...frame, ...counted };

		const maxMatches = Math.max(1, readBounded(args.maxMatches, DEFAULT_MAX_MATCHES, MAX_MATCHES));
		const around = readBounded(args.context, DEFAULT_CONTEXT, MAX_CONTEXT);
		const lines = new LineIndex(text);
		const matches = found
			.slice(0, maxMatches)
			.map((match) => (mode === "lines" ? describeLine(text, lines, match) : describeExcerpt(text, lines, match, around)));
		return this.budget.fit({ ...frame, ...counted, matches }, "matches");
	}

	private findByPattern(text: string, pattern: string, caseSensitive: boolean): Match[] | RejectedPattern {
		const built = this.guard.build(pattern, caseSensitive);
		if (built instanceof RejectedPattern) return built;
		const found: Match[] = [];
		for (const match of text.matchAll(built)) {
			if (found.length >= MAX_COUNTED_MATCHES) break;
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

class LineIndex {
	private readonly starts: number[] = [0];

	public constructor(private readonly text: string) {
		for (let at = text.indexOf("\n"); at !== -1; at = text.indexOf("\n", at + 1)) this.starts.push(at + 1);
	}

	public lineOf(offset: number): number {
		let low = 0;
		let high = this.starts.length - 1;
		while (low < high) {
			const middle = Math.ceil((low + high) / 2);
			if ((this.starts[middle] ?? 0) <= offset) low = middle;
			else high = middle - 1;
		}
		return low + 1;
	}

	public boundsOf(line: number): [number, number] {
		const start = this.starts[line - 1] ?? 0;
		const next = this.starts[line];
		const end = next === undefined ? this.text.length : next - 1;
		return [start, end];
	}
}

function findByText(text: string, query: string, caseSensitive: boolean): Match[] {
	const haystack = caseSensitive ? text : text.toLowerCase();
	const needle = caseSensitive ? query : query.toLowerCase();
	const found: Match[] = [];
	let at = haystack.indexOf(needle);
	while (at !== -1 && found.length < MAX_COUNTED_MATCHES) {
		found.push(new Match(at, needle.length));
		at = haystack.indexOf(needle, at + Math.max(1, needle.length));
	}
	return found;
}

function describeExcerpt(text: string, lines: LineIndex, match: Match, around: number): Record<string, unknown> {
	const start = Math.max(0, match.offset - around);
	return {
		offset: match.offset,
		line: lines.lineOf(match.offset),
		excerpt: text.slice(start, match.offset + match.length + around),
		excerptOffset: start,
	};
}

function describeLine(text: string, lines: LineIndex, match: Match): Record<string, unknown> {
	const line = lines.lineOf(match.offset);
	const [start, end] = lines.boundsOf(line);
	return { offset: match.offset, line, text: text.slice(start, end) };
}

function readMode(value: unknown): string {
	return typeof value === "string" && MODES.includes(value) ? value : "excerpts";
}

function isOptionalBoolean(value: unknown): boolean {
	return value === undefined || value === null || typeof value === "boolean";
}

function readBounded(value: unknown, fallback: number, ceiling: number): number {
	if (typeof value !== "number" || !Number.isFinite(value) || value < 0) return fallback;
	return Math.min(ceiling, Math.trunc(value));
}
