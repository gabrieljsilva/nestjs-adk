import { describe, expect, it } from "vitest";
import { SessionId } from "../../common/identity/session-id";
import { TokenThresholdCompactionPolicy } from "../../domain/context/token-threshold-compaction-policy";
import { ToolDeclaration } from "../../domain/model/tool-declaration";
import { PromptInstructions } from "../../domain/prompt/prompt-instructions";
import { StubModel } from "../../support/model/stub-model.fixture";
import { PrepareContextCommand } from "./prepare-context-command";

const SESSION = SessionId.from("s-1");
const model = new StubModel();

describe("PrepareContextCommand", () => {
	it("carries the session and the model that will read the context", () => {
		const command = new PrepareContextCommand(SESSION, model);

		expect(command.sessionId).toBe(SESSION);
		expect(command.model).toBe(model);
	});

	it("offers no tools and no prompts unless it was given them", () => {
		const command = new PrepareContextCommand(SESSION, model);

		expect(command.tools).toEqual([]);
		expect(command.runtimeInstructions).toBeUndefined();
		expect(command.agentPrompt).toBeUndefined();
	});

	it("compacts nothing unless a policy was declared", () => {
		expect(new PrepareContextCommand(SESSION, model).compaction).toBeUndefined();
	});

	it("carries tools, prompts and the policy when they were declared", () => {
		const command = new PrepareContextCommand(
			SESSION,
			model,
			[new ToolDeclaration("search", "finds things", {})],
			PromptInstructions.from("runtime"),
			PromptInstructions.from("agent"),
			new TokenThresholdCompactionPolicy(1000, 600, 2),
		);

		expect(command.tools).toHaveLength(1);
		expect(command.runtimeInstructions?.text).toBe("runtime");
		expect(command.agentPrompt?.text).toBe("agent");
		expect(command.compaction).toBeInstanceOf(TokenThresholdCompactionPolicy);
	});
});
