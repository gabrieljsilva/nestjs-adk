import { describe, expect, it } from "vitest";
import { SessionId } from "../../common/identity/session-id";
import { AgentName } from "../../domain/agent/agent-name";
import { AskInput } from "../../domain/session/ask-input";
import { RunLimits } from "../../domain/session/run-limits";
import { SessionMode } from "../../domain/session/session-mode";
import { AgentRunCommand } from "./agent-run-command";

const SUPPORT = AgentName.from("support");

describe("AgentRunCommand", () => {
	it("defaults to an ephemeral session with no declared limits", () => {
		const command = new AgentRunCommand(SUPPORT, AskInput.of("hi"));

		expect(command.mode.equals(SessionMode.EPHEMERAL)).toBe(true);
		expect(command.limits.hasIterationLimit).toBe(false);
		expect(command.model).toBeUndefined();
	});

	it("continues a session when the input names one", () => {
		const command = new AgentRunCommand(SUPPORT, AskInput.of("hi", SessionId.from("s-1")));

		expect(command.continuesSession).toBe(true);
		expect(new AgentRunCommand(SUPPORT, AskInput.of("hi")).continuesSession).toBe(false);
	});

	it("carries the limits the caller already resolved", () => {
		const command = new AgentRunCommand(SUPPORT, AskInput.of("hi"), RunLimits.of(4));

		expect(command.limits.maxIterations).toBe(4);
	});
});
