import { AgentRunStatus, SessionId, ToolCallId } from "@nestjs-adk/core";
import { describe, expect, it } from "vitest";
import { AgentStub } from "./agent-stub";

describe("AgentStub", () => {
	it("answers the same words until a queued answer says otherwise", async () => {
		const stub = new AgentStub().answersWith("answered");

		expect((await stub.ask("hi")).text).toBe("answered");
		expect((await stub.ask("again")).text).toBe("answered");
	});

	it("takes queued answers in order, then falls back", async () => {
		const stub = new AgentStub().answersWith("default").thenAnswers("first").thenAnswers("second");

		expect((await stub.ask("1")).text).toBe("first");
		expect((await stub.ask("2")).text).toBe("second");
		expect((await stub.ask("3")).text).toBe("default");
	});

	it("records what the caller handed it, unchanged", async () => {
		const stub = new AgentStub();

		await stub.ask("my controller arrived broken", { sessionId: "session-9" });

		expect(stub.asks.map((ask) => ask.message)).toEqual(["my controller arrived broken"]);
		expect(stub.lastOptions.sessionId).toBe("session-9");
	});

	it("answers empty options for a question that carried none", async () => {
		const stub = new AgentStub();

		await stub.ask("hi");

		expect(stub.lastOptions).toEqual({});
	});

	it("answers empty options for a question that carried only a session id", async () => {
		const stub = new AgentStub();

		await stub.ask("hi", SessionId.from("session-1"));

		expect(stub.lastOptions).toEqual({});
	});

	it("hands back a run that stopped in front of a human", async () => {
		const stub = new AgentStub().answersWith(AgentStub.awaiting("issue_refund", { orderId: "A-1042" }));

		const result = await stub.ask("refund it");

		expect(result.status.equals(AgentRunStatus.SUSPENDED)).toBe(true);
		expect(result.awaiting.at(0)?.toolName).toBe("issue_refund");
		expect(result.isAwaitingApproval).toBe(true);
	});

	it("records a decision with everything the caller passed", async () => {
		const stub = new AgentStub();

		await stub.approve("session-1", ToolCallId.from("call-1"), "manager@nebula.test");
		await stub.reject("session-1", ToolCallId.from("call-2"), "outside the window", "manager@nebula.test");

		expect(stub.decisions).toEqual([
			{ kind: "approve", sessionId: "session-1", callId: "call-1", by: "manager@nebula.test" },
			{
				kind: "reject",
				sessionId: "session-1",
				callId: "call-2",
				reason: "outside the window",
				by: "manager@nebula.test",
			},
		]);
	});

	/** Building a real inspection would mean building a journal, which is what the bed is for. */
	it("refuses to inspect, saying where to go instead", async () => {
		await expect(new AgentStub().inspect()).rejects.toThrow(/AdkTestBed/);
	});
});
