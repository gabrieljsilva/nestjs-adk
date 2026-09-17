import { describe, expect, it } from "vitest";
import { AgentName } from "../../../domain/agent/agent-name.value-object";
import { DelegationNotDeclaredError } from "../../../domain/agent/errors/delegation-not-declared.error";
import { AskInput } from "../../../domain/session/input/ask-input.command";
import { DelegateInput } from "../../../domain/session/input/delegate-input.command";
import { NativeStackFixture } from "../../../support/run/native-stack.fixture";
import { ScriptedModel } from "../../../support/run/scripted-model.fixture";
import { AgentRunCommand } from "../agent-run.command";

const SUPPORT = NativeStackFixture.AGENT;

describe("DelegateAgentUseCase", () => {
	it("refuses a delegation the asking agent never declared, without touching the session", async () => {
		const stack = new NativeStackFixture(new ScriptedModel("primary"));
		const started = await stack.runner.ask(
			new AgentRunCommand({
				agent: SUPPORT,
				input: AskInput.fromMessage("hi"),
			}),
		);
		const before = (await stack.readJournal(started.sessionId)).length;

		await expect(
			stack.runner.delegate(new DelegateInput(started.sessionId, SUPPORT, AgentName.from("support"), "do it")),
		).rejects.toBeInstanceOf(DelegationNotDeclaredError);

		expect((await stack.readJournal(started.sessionId)).length).toBe(before);
	});

	it("answers on the session that already existed, keeping its id", async () => {
		const stack = new NativeStackFixture(new ScriptedModel("primary"));
		const started = await stack.runner.ask(
			new AgentRunCommand({
				agent: SUPPORT,
				input: AskInput.fromMessage("hi"),
			}),
		);

		await expect(
			stack.runner.delegate(new DelegateInput(started.sessionId, SUPPORT, AgentName.from("nobody"), "do it")),
		).rejects.toThrow();
	});
});
