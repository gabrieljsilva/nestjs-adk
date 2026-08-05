import { beforeEach, describe, expect, it } from "vitest";
import { SessionId } from "../../common/identity/session-id";
import { ToolCallId } from "../../common/identity/tool-call-id";
import { ApproveInput } from "../../domain/session/approve-input";
import { AskInput } from "../../domain/session/ask-input";
import { ApprovalNotPendingError } from "../../domain/session/errors/approval-not-pending.error";
import { RejectInput } from "../../domain/session/reject-input";
import { NativeStackFixture } from "../../support/run/native-stack.fixture";
import { ScriptedModel } from "../../support/run/scripted-model.fixture";
import { AgentRunCommand } from "./agent-run-command";

const SUPPORT = NativeStackFixture.AGENT;
const CALL = ToolCallId.from("c-1");

let stack: NativeStackFixture;

beforeEach(() => {
	stack = new NativeStackFixture(new ScriptedModel("primary"));
});

describe("AgentRunner", () => {
	it("answers a question, which is the whole of what asking does from outside", async () => {
		const result = await stack.runner.ask(new AgentRunCommand(SUPPORT, AskInput.of("hi")));

		expect(result.text).toBe("hello");
		expect(result.sessionId.value).toBeTruthy();
	});

	it("takes an approval to the session it names, which answers that nothing is pending", async () => {
		const first = await stack.runner.ask(new AgentRunCommand(SUPPORT, AskInput.of("hi")));

		const error = await stack.runner.approve(ApproveInput.of(first.sessionId, CALL)).catch((reason) => reason);

		expect(error).toBeInstanceOf(ApprovalNotPendingError);
	});

	it("takes a rejection the same way, so both decisions travel one road", async () => {
		const first = await stack.runner.ask(new AgentRunCommand(SUPPORT, AskInput.of("hi")));

		const error = await stack.runner
			.reject(RejectInput.of(first.sessionId, CALL, "not authorized"))
			.catch((reason) => reason);

		expect(error).toBeInstanceOf(ApprovalNotPendingError);
	});

	it("refuses a decision on a session that does not exist, rather than inventing one", async () => {
		const error = await stack.runner
			.approve(ApproveInput.of(SessionId.from("never-created"), CALL))
			.catch((reason) => reason);

		expect(error).toBeInstanceOf(Error);
	});
});
