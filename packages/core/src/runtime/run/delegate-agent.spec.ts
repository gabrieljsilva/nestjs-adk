import { describe, expect, it } from "vitest";
import { AgentName } from "../../domain/agent/agent-name";
import { DelegationNotDeclaredError } from "../../domain/agent/errors/delegation-not-declared.error";
import { AskInput } from "../../domain/session/ask-input";
import { DelegateInput } from "../../domain/session/delegate-input";
import { NativeStackFixture } from "../../support/run/native-stack.fixture";
import { ScriptedModel } from "../../support/run/scripted-model.fixture";
import { AgentRunCommand } from "./agent-run-command";

const SUPPORT = NativeStackFixture.AGENT;

describe("DelegateAgent", () => {
	it("refuses a delegation the asking agent never declared, without touching the session", async () => {
		const stack = new NativeStackFixture(new ScriptedModel("primary"));
		const started = await stack.runner.ask(new AgentRunCommand(SUPPORT, AskInput.of("hi")));
		const before = (await stack.journalOf(started.sessionId)).length;

		await expect(
			stack.runner.delegate(new DelegateInput(started.sessionId, SUPPORT, AgentName.from("support"), "do it")),
		).rejects.toBeInstanceOf(DelegationNotDeclaredError);

		expect((await stack.journalOf(started.sessionId)).length).toBe(before);
	});

	it("answers on the session that already existed, keeping its id", async () => {
		const stack = new NativeStackFixture(new ScriptedModel("primary"));
		const started = await stack.runner.ask(new AgentRunCommand(SUPPORT, AskInput.of("hi")));

		await expect(
			stack.runner.delegate(new DelegateInput(started.sessionId, SUPPORT, AgentName.from("nobody"), "do it")),
		).rejects.toThrow();
	});
});
