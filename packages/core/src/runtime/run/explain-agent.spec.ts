import { describe, expect, it } from "vitest";
import { ContextSegment } from "../../domain/diagnostics/context-segment";
import { AskInput } from "../../domain/session/ask-input";
import { NativeStackFixture } from "../../support/run/native-stack.fixture";
import { ScriptedModel } from "../../support/run/scripted-model.fixture";
import { AgentRunCommand } from "./agent-run-command";
import { ExplainAgent } from "./explain-agent";

describe("ExplainAgent", () => {
	it("hands back one snapshot per model call the run made", async () => {
		const stack = new NativeStackFixture(new ScriptedModel("primary"));

		const snapshots = await new ExplainAgent(stack.asking).handle(
			new AgentRunCommand(NativeStackFixture.AGENT, AskInput.of("hi")),
		);

		expect(snapshots).toHaveLength(1);
		expect(snapshots[0]?.agent.value).toBe("support");
		expect(snapshots[0]?.model.toString()).toBe("acme/primary");
	});

	it("shows the question inside the conversation the model was sent", async () => {
		const stack = new NativeStackFixture(new ScriptedModel("primary"));

		const snapshots = await new ExplainAgent(stack.asking).handle(
			new AgentRunCommand(NativeStackFixture.AGENT, AskInput.of("where is order 42?")),
		);

		expect(snapshots[0]?.segment(ContextSegment.CONVERSATION)?.text).toContain("where is order 42?");
	});

	it("keeps what it saw of a run that failed, because a failed run is worth looking at", async () => {
		const stack = new NativeStackFixture(new ScriptedModel("primary", [], true));

		const snapshots = await new ExplainAgent(stack.asking).attempt(
			new AgentRunCommand(NativeStackFixture.AGENT, AskInput.of("hi")),
		);

		expect(snapshots).toHaveLength(1);
	});

	it("runs the agent for real, so the session it explains exists afterwards", async () => {
		const stack = new NativeStackFixture(new ScriptedModel("primary"));

		await new ExplainAgent(stack.asking).handle(new AgentRunCommand(NativeStackFixture.AGENT, AskInput.of("hi")));

		const result = await stack.runner.ask(new AgentRunCommand(NativeStackFixture.AGENT, AskInput.of("again")));
		expect((await stack.journalOf(result.sessionId)).length).toBeGreaterThan(0);
	});
});
