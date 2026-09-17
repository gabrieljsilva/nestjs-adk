import type { ArtifactStorage } from "../../contracts/storage/artifact-storage.contract";
import { CharacterCountOffloadPolicy } from "../../domain/artifact/character-count-offload.policy";
import type { OffloadPolicy } from "../../domain/artifact/offload.policy";
import type { ToolDefinition } from "../../domain/tool/tool-definition.value-object";
import { ArtifactBudget } from "./artifact-budget.value-object";
import { ArtifactLoader } from "./artifact-loader.service";
import { OutlineArtifactTool } from "./tools/outline-artifact.tool";
import { QueryArtifactTool } from "./tools/query-artifact.tool";
import { SearchArtifactTool } from "./tools/search-artifact.tool";

/**
 * The three tools that answer a question about an artifact without bringing it back.
 *
 * `read_artifact` is the way back from a placeholder and these are the way around it: a
 * model looking for one number in a forty thousand character report should not have to pay
 * for the report, and before this it had no other move. Outline says what is in there,
 * search says where, and query reads one value out by pointer.
 *
 * Three properties hold for all of them, and each one is a rule rather than a habit.
 *
 * They are internal, like `read_artifact`, so no approval policy applies: a policy written
 * for an application's tools must not be able to leave a model unable to read what the
 * runtime told it to read.
 *
 * They are session scoped through `ArtifactLoader`, so an id from another conversation
 * misses rather than refuses.
 *
 * And every answer is budgeted at the offload threshold, which is what stops the recursion.
 * An answer larger than the size the runtime moves results out at would itself be moved
 * out, and the model would be handed a placeholder describing a placeholder. Fitting is by
 * dropping and it is always declared, so an answer that was cut says so.
 *
 * Nothing here evaluates anything. The search compiles a pattern only through
 * {@link RegexGuard}, and the query language is a JSON Pointer, which walks and cannot
 * compute.
 */
export class ArtifactExplorer {
	private readonly definitions: readonly ToolDefinition[];

	public constructor(storage: ArtifactStorage, policy: OffloadPolicy = CharacterCountOffloadPolicy.byDefault()) {
		const artifacts = new ArtifactLoader(storage);
		const budget = ArtifactBudget.fromPolicy(policy);
		this.definitions = [
			OutlineArtifactTool.build(artifacts, budget),
			SearchArtifactTool.build(artifacts, budget),
			QueryArtifactTool.build(artifacts, budget),
		];
	}

	/** What the run catalog is given, beside `read_artifact` and in the same breath as it. */
	public getTools(): readonly ToolDefinition[] {
		return this.definitions;
	}
}
