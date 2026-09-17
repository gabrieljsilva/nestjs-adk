import { ArtifactId } from "../../common/identity/artifact-id";
import type { ArtifactStorage } from "../../contracts/storage/artifact-storage";
import { ArtifactNotFoundError } from "../../domain/artifact/errors/artifact-not-found.error";
import { ToolEffect } from "../../domain/tool/approval/tool-effect";
import { ParsedArguments } from "../../domain/tool/invocation/parsed-arguments";
import type { ToolContext } from "../../domain/tool/invocation/tool-context";
import { ToolHandler } from "../../domain/tool/invocation/tool-handler";
import { ToolDefinition } from "../../domain/tool/tool-definition";
import { ToolSchema } from "../../domain/tool/tool-schema";

const NAME = "read_artifact";

const DESCRIPTION =
	"Reads back the full content of an artifact that was too large to include in the conversation. " +
	"Use it with the id shown in a placeholder such as [artifact a-1, text/plain, 40000 characters].";

/**
 * The one tool the runtime offers on its own behalf.
 *
 * Offloading is only honest if the model can undo it: a result the runtime moved out is
 * a result the model was told about and cannot read, and this is the way back. It is
 * scoped to the session that asks, resolves the id it was given rather than trusting a
 * reference the model could have rewritten, and verifies what it reads against what was
 * stored.
 *
 * It enters the catalog of every run the runtime composes. A placeholder the model cannot
 * resolve is worse than the result it replaced, and that is what a tool built and never
 * offered would leave behind.
 */
export class ReadArtifactTool {
	public static readonly NAME = NAME;

	private constructor() {}

	public static forStorage(storage: ArtifactStorage): ToolDefinition {
		return new ToolDefinition(
			NAME,
			DESCRIPTION,
			new ArtifactIdSchema(),
			ToolEffect.READ,
			new ArtifactContentHandler(storage),
			true,
		);
	}
}

/** Accepts an id and nothing else: which session it is read under is never the model's to choose. */
class ArtifactIdSchema extends ToolSchema {
	public declaration(): unknown {
		return {
			type: "object",
			properties: {
				artifactId: { type: "string", description: "The id shown in the artifact placeholder." },
			},
			required: ["artifactId"],
			additionalProperties: false,
		};
	}

	public parse(args: unknown): ParsedArguments {
		const value = typeof args === "object" && args !== null ? Reflect.get(args, "artifactId") : undefined;
		if (typeof value !== "string" || value.trim().length === 0) {
			return ParsedArguments.invalid("artifactId is required and must be a non empty string.");
		}
		return ParsedArguments.valid({ artifactId: value });
	}
}

/** Resolves the id inside the session that asked, so knowing an id is not enough to read one. */
class ArtifactContentHandler extends ToolHandler {
	public constructor(private readonly storage: ArtifactStorage) {
		super();
	}

	public async invoke(args: Record<string, unknown>, context: ToolContext): Promise<unknown> {
		const artifactId = ArtifactId.from(String(args.artifactId));
		const session = context.toSessionContext();
		const reference = await this.storage.find(session, artifactId);
		if (reference === undefined) throw new ArtifactNotFoundError(artifactId.value, session.sessionId.value);
		return (await this.storage.read(session, reference)).text;
	}
}
