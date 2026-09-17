import { describe, expect, it } from "vitest";
import { SessionId } from "../../common/identity/session-id.value-object";
import { WindowShareCompactionPolicy } from "../../domain/context/window-share-compaction.policy";
import { ToolDeclaration } from "../../domain/model/messages/tool-declaration.value-object";
import { PromptInstructions } from "../../domain/prompt/prompt-instructions.value-object";
import { StubModel } from "../../support/model/stub-model.fixture";
import { RunContextFixture } from "../../support/run/run-context.fixture";
import { PrepareContextCommand } from "./prepare-context.command";

const SESSION = SessionId.from("s-1");
const model = new StubModel();

const RUN = RunContextFixture.run(SESSION);

describe("PrepareContextCommand", () => {
	it("carries the session and the model that will read the context", () => {
		const command = new PrepareContextCommand(RUN, model);

		expect(command.sessionId).toBe(SESSION);
		expect(command.model).toBe(model);
	});

	it("offers no tools and no prompts unless it was given them", () => {
		const command = new PrepareContextCommand(RUN, model);

		expect(command.tools).toEqual([]);
		expect(command.runtimeInstructions).toBeUndefined();
		expect(command.agentPrompt).toBeUndefined();
	});

	it("compacts nothing unless a policy was declared", () => {
		expect(new PrepareContextCommand(RUN, model).compaction).toBeUndefined();
	});

	it("carries tools, prompts and the policy when they were declared", () => {
		const command = new PrepareContextCommand(
			RUN,
			model,
			[new ToolDeclaration("search", "finds things", {})],
			PromptInstructions.from("runtime"),
			PromptInstructions.from("agent"),
			new WindowShareCompactionPolicy({ maxShare: 0.9, targetShare: 0.7, keepRecentBlocks: 2 }),
		);

		expect(command.tools).toHaveLength(1);
		expect(command.runtimeInstructions?.text).toBe("runtime");
		expect(command.agentPrompt?.text).toBe("agent");
		expect(command.compaction).toBeInstanceOf(WindowShareCompactionPolicy);
	});
});
