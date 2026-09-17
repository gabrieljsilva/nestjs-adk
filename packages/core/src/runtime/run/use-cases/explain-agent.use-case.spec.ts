import { describe, expect, it } from "vitest";
import { ContextSegment } from "../../../domain/diagnostics/context-segment.value-object";
import { AskInput } from "../../../domain/session/input/ask-input.command";
import { NativeStackFixture } from "../../../support/run/native-stack.fixture";
import { ScriptedModel } from "../../../support/run/scripted-model.fixture";
import { AgentRunCommand } from "../agent-run.command";
import { ExplainAgentUseCase } from "./explain-agent.use-case";

describe("ExplainAgentUseCase", () => {
	it("hands back one snapshot per model call the run made", async () => {
		const stack = new NativeStackFixture(new ScriptedModel("primary"));

		const snapshots = await new ExplainAgentUseCase(stack.asking).execute(
			new AgentRunCommand({
				agent: NativeStackFixture.AGENT,
				input: AskInput.fromMessage("hi"),
			}),
		);

		expect(snapshots).toHaveLength(1);
		expect(snapshots[0]?.agent.value).toBe("support");
		expect(snapshots[0]?.model.toString()).toBe("acme/primary");
	});

	it("shows the question inside the conversation the model was sent", async () => {
		const stack = new NativeStackFixture(new ScriptedModel("primary"));

		const snapshots = await new ExplainAgentUseCase(stack.asking).execute(
			new AgentRunCommand({
				agent: NativeStackFixture.AGENT,
				input: AskInput.fromMessage("where is order 42?"),
			}),
		);

		expect(snapshots[0]?.segment(ContextSegment.CONVERSATION)?.text).toContain("where is order 42?");
	});

	it("lets the failure through, because a caller cannot read snapshots as an answer", async () => {
		const stack = new NativeStackFixture(new ScriptedModel("primary", [], true));

		await expect(
			new ExplainAgentUseCase(stack.asking).execute(
				new AgentRunCommand({
					agent: NativeStackFixture.AGENT,
					input: AskInput.fromMessage("hi"),
				}),
			),
		).rejects.toThrow();
	});

	it("runs the agent for real, so the session it explains exists afterwards", async () => {
		const stack = new NativeStackFixture(new ScriptedModel("primary"));

		await new ExplainAgentUseCase(stack.asking).execute(
			new AgentRunCommand({
				agent: NativeStackFixture.AGENT,
				input: AskInput.fromMessage("hi"),
			}),
		);

		const result = await stack.runner.ask(
			new AgentRunCommand({
				agent: NativeStackFixture.AGENT,
				input: AskInput.fromMessage("again"),
			}),
		);
		expect((await stack.readJournal(result.sessionId)).length).toBeGreaterThan(0);
	});
});
