import { describe, expect, it } from "vitest";
import { ArtifactExplorationTools } from "../artifact/artifact-explorer.service";
import { ReadArtifactTool } from "../artifact/read-artifact.tool";
import { EditArtifactTool } from "../artifact/tools/edit-artifact.tool";
import { DelegateToAgentTool } from "../delegation/delegate-to-agent.tool";
import { ActivateSkillTool } from "../skill/activate-skill.tool";
import { TransferToAgentTool } from "../transfer/transfer-to-agent.tool";
import { RuntimeToolNames } from "./runtime-tool-names.value-object";

/**
 * The set exists so a boot check can ask "is this name the runtime's?" without composing a
 * runtime first. What it must never do is answer no to a name the runtime later binds, so the
 * cases below compare it against the tools themselves rather than against a written list.
 */
describe("the names the runtime owns", () => {
	it("holds the always-on tool, because an agent with tools is given it whether it asked or not", () => {
		expect(RuntimeToolNames.owns(ReadArtifactTool.NAME)).toBe(true);
	});

	it("holds every tool of the exploration group, so asking for the group cannot widen the set", () => {
		const asked = ArtifactExplorationTools.map((tool) => tool.request().name);

		expect(asked.every((name) => RuntimeToolNames.owns(name))).toBe(true);
	});

	it("holds the editing tool, which is opt-in and lives outside the exploration group", () => {
		expect(RuntimeToolNames.owns(EditArtifactTool.NAME)).toBe(true);
	});

	it("holds the skill tool, which the run scope appends whenever the agent has an on-demand skill", () => {
		expect(RuntimeToolNames.owns(ActivateSkillTool.NAME)).toBe(true);
	});

	it("holds the transfer tool, which the run scope appends whenever the agent has a transfer edge", () => {
		expect(RuntimeToolNames.owns(TransferToAgentTool.NAME)).toBe(true);
	});

	it("holds the delegation tool, which the run scope appends whenever the agent has a delegation edge", () => {
		expect(RuntimeToolNames.owns(DelegateToAgentTool.NAME)).toBe(true);
	});

	it("answers yes for those three without being asked what the agent declared, because a set that depended on an edge would hand a name back and take it away again the day the edge is added", () => {
		const conditional = [ActivateSkillTool.NAME, TransferToAgentTool.NAME, DelegateToAgentTool.NAME];

		expect(conditional.every((name) => RuntimeToolNames.owns(name))).toBe(true);
	});

	it("is exactly the artifact tools plus the three the run scope appends, and nothing else", () => {
		expect([...RuntimeToolNames.all].sort()).toEqual(
			[
				ReadArtifactTool.NAME,
				EditArtifactTool.NAME,
				...ArtifactExplorationTools.map((tool) => tool.request().name),
				ActivateSkillTool.NAME,
				TransferToAgentTool.NAME,
				DelegateToAgentTool.NAME,
			].sort(),
		);
	});

	it("answers no to a name the application chose, so an ordinary tool is never refused", () => {
		expect(RuntimeToolNames.owns("lookup_order")).toBe(false);
	});
});
