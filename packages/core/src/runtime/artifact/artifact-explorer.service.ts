import type { ArtifactStorage } from "../../contracts/storage/artifact-storage.contract";
import { CharacterCountOffloadPolicy } from "../../domain/artifact/character-count-offload.policy";
import type { OffloadPolicy } from "../../domain/artifact/offload.policy";
import type { ToolDefinition } from "../../domain/tool/tool-definition.value-object";
import { ArtifactBudget } from "./artifact-budget.value-object";
import { ArtifactLoader } from "./artifact-loader.service";
import { OutlineArtifactTool } from "./tools/outline-artifact.tool";
import { QueryArtifactTool } from "./tools/query-artifact.tool";
import { SearchArtifactTool } from "./tools/search-artifact.tool";

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

	public getTools(): readonly ToolDefinition[] {
		return this.definitions;
	}
}
