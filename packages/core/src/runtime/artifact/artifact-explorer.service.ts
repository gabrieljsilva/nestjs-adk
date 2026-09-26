import type { ArtifactStorage } from "../../contracts/storage/artifact-storage.contract";
import { CharacterCountOffloadPolicy } from "../../domain/artifact/character-count-offload.policy";
import type { OffloadPolicy } from "../../domain/artifact/offload.policy";
import type { ToolDefinition } from "../../domain/tool/tool-definition.value-object";
import { ArtifactBudget } from "./artifact-budget.value-object";
import { ArtifactLoader } from "./artifact-loader.service";
import { ListArtifactsTool } from "./tools/list-artifacts.tool";
import { OutlineArtifactTool } from "./tools/outline-artifact.tool";
import { QueryArtifactTool } from "./tools/query-artifact.tool";
import { SearchArtifactTool } from "./tools/search-artifact.tool";
import { SliceArtifactTool } from "./tools/slice-artifact.tool";

/**
 * Every tool that explores an artifact, for an agent that should be able to open whatever it is
 * given rather than one kind of file: `tools: [...ArtifactExplorationTools, MyTool]`. Listing the
 * classes one by one is the same thing, and is what an agent that only handles CSV should do.
 *
 * `read_artifact` is not here. Every agent that has tools already has it, because a placeholder
 * the model cannot open at all is worse than no attachment.
 */
export const ArtifactExplorationTools = Object.freeze([
	ListArtifactsTool,
	OutlineArtifactTool,
	SearchArtifactTool,
	QueryArtifactTool,
	SliceArtifactTool,
]);

export class ArtifactExplorer {
	private readonly definitions: readonly ToolDefinition[];

	public constructor(
		storage: ArtifactStorage,
		policy: OffloadPolicy = CharacterCountOffloadPolicy.byDefault(),
		budget: ArtifactBudget = ArtifactBudget.fromPolicy(policy),
	) {
		const artifacts = new ArtifactLoader(storage, budget.maxExplorableCharacters);
		this.definitions = [
			ListArtifactsTool.build(storage, policy, budget),
			OutlineArtifactTool.build(artifacts, budget),
			SearchArtifactTool.build(artifacts, budget),
			QueryArtifactTool.build(artifacts, budget),
			SliceArtifactTool.build(artifacts, budget),
		];
	}

	public getTools(): readonly ToolDefinition[] {
		return this.definitions;
	}
}
