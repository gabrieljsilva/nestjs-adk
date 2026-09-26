import { ReadArtifactTool } from "../artifact/read-artifact.tool";
import { EditArtifactTool } from "../artifact/tools/edit-artifact.tool";
import { ListArtifactsTool } from "../artifact/tools/list-artifacts.tool";
import { OutlineArtifactTool } from "../artifact/tools/outline-artifact.tool";
import { QueryArtifactTool } from "../artifact/tools/query-artifact.tool";
import { SearchArtifactTool } from "../artifact/tools/search-artifact.tool";
import { SliceArtifactTool } from "../artifact/tools/slice-artifact.tool";
import { DelegateToAgentTool } from "../delegation/delegate-to-agent.tool";
import { ActivateSkillTool } from "../skill/activate-skill.tool";
import { TransferToAgentTool } from "../transfer/transfer-to-agent.tool";

export class RuntimeToolNames {
	private static readonly owned: ReadonlySet<string> = new Set([
		ReadArtifactTool.NAME,
		ListArtifactsTool.NAME,
		OutlineArtifactTool.NAME,
		SearchArtifactTool.NAME,
		QueryArtifactTool.NAME,
		SliceArtifactTool.NAME,
		EditArtifactTool.NAME,
		ActivateSkillTool.NAME,
		TransferToAgentTool.NAME,
		DelegateToAgentTool.NAME,
	]);

	private constructor() {}

	public static get all(): readonly string[] {
		return [...RuntimeToolNames.owned];
	}

	public static owns(name: string): boolean {
		return RuntimeToolNames.owned.has(name);
	}
}
