import type { ArtifactStorage } from "../../../contracts/storage/artifact-storage.contract";
import type { ArtifactReference } from "../../../domain/artifact/artifact-reference.value-object";
import type { OffloadPolicy } from "../../../domain/artifact/offload.policy";
import { ToolEffect } from "../../../domain/tool/approval/tool-effect.value-object";
import { ParsedArguments } from "../../../domain/tool/invocation/parsed-arguments.value-object";
import type { ToolContext } from "../../../domain/tool/invocation/tool-context.value-object";
import { ToolHandler } from "../../../domain/tool/invocation/tool-handler.contract";
import { RuntimeToolRequest } from "../../../domain/tool/runtime-tool-request.value-object";
import type { ToolDefinition } from "../../../domain/tool/tool-definition.value-object";
import { ToolSchema } from "../../../domain/tool/tool-schema.contract";
import type { ArtifactBudget } from "../artifact-budget.value-object";

const NAME = "list_artifacts";

const DESCRIPTION =
	"Lists the artifacts of this conversation, newest first: files attached to it and results that were too large to keep inline. " +
	"Each entry says the id, the name when there is one, the type, the size, and whether its shape is one the artifact exploration tools understand. " +
	"Call it when you need a file you were not shown the id of.";

const MAX_LISTED = 100;

/**
 * Lists every artifact the session holds. List it in `@Agent({ tools })` for an agent that is
 * handed files it was never told the id of, or that has to find one a previous turn produced.
 */
export class ListArtifactsTool {
	public static readonly NAME = NAME;
	public static readonly MAX_LISTED = MAX_LISTED;

	private constructor() {}

	public static request(): RuntimeToolRequest {
		return new RuntimeToolRequest(NAME, DESCRIPTION, new NoArgumentsSchema(), ToolEffect.READ);
	}

	public static build(storage: ArtifactStorage, policy: OffloadPolicy, budget: ArtifactBudget): ToolDefinition {
		return ListArtifactsTool.request().boundTo(new ListHandler(storage, policy, budget));
	}
}

class NoArgumentsSchema extends ToolSchema {
	public declaration(): unknown {
		return { type: "object", properties: {}, additionalProperties: false };
	}

	public parse(): ParsedArguments {
		return ParsedArguments.valid({});
	}
}

class ListHandler extends ToolHandler {
	public constructor(
		private readonly storage: ArtifactStorage,
		private readonly policy: OffloadPolicy,
		private readonly budget: ArtifactBudget,
	) {
		super();
	}

	public async invoke(_args: Record<string, unknown>, context: ToolContext): Promise<unknown> {
		const listed = await this.storage.list(context.toSessionContext(), MAX_LISTED + 1);
		const artifacts = listed.slice(0, MAX_LISTED).map((reference) => this.describe(reference));
		const answer = this.budget.fit({ artifacts }, "artifacts");
		return listed.length > MAX_LISTED ? { ...answer, truncated: true } : answer;
	}

	private describe(reference: ArtifactReference): Record<string, unknown> {
		return {
			artifactId: reference.id.value,
			name: reference.name?.value,
			mediaType: reference.mediaType,
			isText: reference.isText,
			characters: reference.isText ? reference.characters : undefined,
			bytes: reference.bytes,
			explorable: this.isExplorable(reference),
		};
	}

	private isExplorable(reference: ArtifactReference): boolean {
		if (!reference.isText) return false;
		return this.policy.decide(reference.characters, reference.mediaType).isExplorable;
	}
}
