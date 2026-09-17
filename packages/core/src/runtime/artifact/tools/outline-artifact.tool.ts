import { ToolEffect } from "../../../domain/tool/approval/tool-effect.value-object";
import { ParsedArguments } from "../../../domain/tool/invocation/parsed-arguments.value-object";
import type { ToolContext } from "../../../domain/tool/invocation/tool-context.value-object";
import { ToolHandler } from "../../../domain/tool/invocation/tool-handler.contract";
import { ToolDefinition } from "../../../domain/tool/tool-definition.value-object";
import { ToolSchema } from "../../../domain/tool/tool-schema.contract";
import { ArtifactBudget } from "../artifact-budget.value-object";
import type { ArtifactLoader, LoadedArtifact } from "../artifact-loader.service";
import { JsonOutline } from "./json-outline.service";

const NAME = "outline_artifact";

const DESCRIPTION =
	"Describes the shape of an artifact without reading it. For JSON, the keys, the types and the length of every array, " +
	"down to `depth` levels (2 by default). For text, how many lines and characters it has and how it starts. " +
	"Call it first: it is what tells you which pointer to ask query_artifact for, or what to search for.";

const DEFAULT_DEPTH = 2;
const MAX_DEPTH = 6;
const FIRST_LINES = 10;

/**
 * What is in there, for a fraction of what reading it would cost.
 *
 * It is the first call of the three, and the reason the other two are usable: a model that
 * has been handed a placeholder knows an id, a media type and a length, which is not enough
 * to write a pointer or guess a search term. An outline is what turns that into a question.
 *
 * The depth is the model's to choose and the budget is not. An outline that grew past what
 * the runtime keeps in a context is answered at a shallower depth until it fits, so a
 * document nested twenty levels deep gives back its top rather than nothing at all.
 */
export class OutlineArtifactTool {
	public static readonly NAME = NAME;

	private constructor() {}

	public static build(artifacts: ArtifactLoader, budget: ArtifactBudget): ToolDefinition {
		return new ToolDefinition(
			NAME,
			DESCRIPTION,
			new OutlineSchema(),
			ToolEffect.READ,
			new OutlineHandler(artifacts, budget),
			true,
		);
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
	private readonly outline = new JsonOutline();

	public constructor(
		private readonly artifacts: ArtifactLoader,
		private readonly budget: ArtifactBudget,
	) {
		super();
	}

	public async invoke(args: Record<string, unknown>, context: ToolContext): Promise<unknown> {
		const loaded = await this.artifacts.loadOrFail(context.toSessionContext(), String(args.artifactId));
		const frame = {
			artifactId: loaded.reference.id.value,
			mediaType: loaded.reference.mediaType,
			totalCharacters: loaded.content.characters,
		};
		const json = this.tryReadJson(loaded);
		if (json.isJson)
			return this.budget.fit(
				{ ...frame, kind: "json", outline: this.fitDepth(json.value, readDepth(args.depth)) },
				"outline",
			);
		return this.budget.fit({ ...frame, kind: "text", ...measureText(loaded.content.text) }, "firstLines");
	}

	/** The deepest outline that still fits, down to naming the root and nothing else. */
	private fitDepth(value: unknown, depth: number): unknown {
		for (let level = depth; level > 0; level -= 1) {
			const built = this.outline.build(value, level);
			if (ArtifactBudget.measure({ outline: built }) <= this.budget.characters) return built;
		}
		return this.outline.build(value, 0);
	}

	/** Text is what everything that is not JSON is, which is why nothing throws here. */
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

/** What an outline of text is: how much there is, and enough of the start to recognize it. */
function measureText(text: string): Record<string, unknown> {
	const lines = text.split("\n");
	return {
		lines: lines.length,
		characters: text.length,
		bytes: new TextEncoder().encode(text).length,
		firstLines: lines.slice(0, FIRST_LINES),
	};
}
