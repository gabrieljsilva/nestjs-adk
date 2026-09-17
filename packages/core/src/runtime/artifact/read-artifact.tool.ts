import type { ArtifactStorage } from "../../contracts/storage/artifact-storage.contract";
import { CharacterCountOffloadPolicy } from "../../domain/artifact/character-count-offload.policy";
import type { OffloadPolicy } from "../../domain/artifact/offload.policy";
import { ToolEffect } from "../../domain/tool/approval/tool-effect.value-object";
import { ParsedArguments } from "../../domain/tool/invocation/parsed-arguments.value-object";
import type { ToolContext } from "../../domain/tool/invocation/tool-context.value-object";
import { ToolHandler } from "../../domain/tool/invocation/tool-handler.contract";
import { ToolDefinition } from "../../domain/tool/tool-definition.value-object";
import { ToolSchema } from "../../domain/tool/tool-schema.contract";
import { ArtifactLoader } from "./artifact-loader.service";
import { ArtifactPage } from "./artifact-page.value-object";

const NAME = "read_artifact";

const DESCRIPTION =
	"Reads back the content of an artifact that was too large to include in the conversation. " +
	"Use it with the id shown in a placeholder such as [artifact a-1, text/plain, 40000 characters, ...]. " +
	"Reading is paged by characters: `offset` says where to start and `limit` how much to take. " +
	"The answer says the total length and whether anything is left after the page it gave you.";

export class ReadArtifactTool {
	public static readonly NAME = NAME;

	private constructor() {}

	public static forStorage(
		storage: ArtifactStorage,
		policy: OffloadPolicy = CharacterCountOffloadPolicy.byDefault(),
	): ToolDefinition {
		const limit = ArtifactPage.resolveDefaultLimit(policy.thresholdCharacters);
		return new ToolDefinition(
			NAME,
			DESCRIPTION,
			new ArtifactPageSchema(limit),
			ToolEffect.READ,
			new ArtifactPageHandler(new ArtifactLoader(storage), limit),
			true,
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
					description: "First character to read, counting from 0. Defaults to 0.",
				},
				limit: {
					type: "integer",
					minimum: 1,
					description: `How many characters to read. Defaults to ${this.defaultLimit}, which is the most the runtime keeps in a context.`,
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
	) {
		super();
	}

	public async invoke(args: Record<string, unknown>, context: ToolContext): Promise<unknown> {
		const loaded = await this.artifacts.loadOrFail(context.toSessionContext(), String(args.artifactId));
		return ArtifactPage.fromContent(
			loaded.content,
			readCount(args.offset) ?? 0,
			readCount(args.limit) ?? this.defaultLimit,
		).toResult(loaded.reference);
	}
}

function isCount(value: unknown): boolean {
	return value === undefined || value === null || readCount(value) !== undefined;
}

function readCount(value: unknown): number | undefined {
	if (typeof value !== "number" || !Number.isFinite(value) || value < 0) return undefined;
	return Math.trunc(value);
}
