import { AgentRunStatus, SessionId, ToolCallId } from "@nestjs-adk/core";
import { describe, expect, it } from "vitest";
import { AgentStub } from "./agent-stub";

describe("AgentStub", () => {
	it("answers the same words until a queued answer says otherwise", async () => {
		const stub = new AgentStub().answersWith("respondido");

		expect((await stub.ask("oi")).text).toBe("respondido");
		expect((await stub.ask("de novo")).text).toBe("respondido");
	});

	it("takes queued answers in order, then falls back", async () => {
		const stub = new AgentStub().answersWith("padrão").thenAnswers("primeira").thenAnswers("segunda");

		expect((await stub.ask("1")).text).toBe("primeira");
		expect((await stub.ask("2")).text).toBe("segunda");
		expect((await stub.ask("3")).text).toBe("padrão");
	});

	it("records what the caller handed it, unchanged", async () => {
		const stub = new AgentStub();

		await stub.ask("meu controle chegou quebrado", { sessionId: "session-9" });

		expect(stub.asks.map((ask) => ask.message)).toEqual(["meu controle chegou quebrado"]);
		expect(stub.lastOptions.sessionId).toBe("session-9");
	});

	it("answers empty options for a question that carried none", async () => {
		const stub = new AgentStub();

		await stub.ask("oi");

		expect(stub.lastOptions).toEqual({});
	});

	it("answers empty options for a question that carried only a session id", async () => {
		const stub = new AgentStub();

		await stub.ask("oi", SessionId.from("session-1"));

		expect(stub.lastOptions).toEqual({});
	});

	it("hands back a run that stopped in front of a human", async () => {
		const stub = new AgentStub().answersWith(AgentStub.awaiting("issue_refund", { orderId: "A-1042" }));

		const result = await stub.ask("devolve");

		expect(result.status.equals(AgentRunStatus.SUSPENDED)).toBe(true);
		expect(result.awaiting.at(0)?.toolName).toBe("issue_refund");
		expect(result.isAwaitingApproval).toBe(true);
	});

	it("records a decision with everything the caller passed", async () => {
		const stub = new AgentStub();

		await stub.approve("session-1", ToolCallId.from("call-1"), "gerente@nebula.test");
		await stub.reject("session-1", ToolCallId.from("call-2"), "fora da janela", "gerente@nebula.test");

		expect(stub.decisions).toEqual([
			{ kind: "approve", sessionId: "session-1", callId: "call-1", by: "gerente@nebula.test" },
			{
				kind: "reject",
				sessionId: "session-1",
				callId: "call-2",
				reason: "fora da janela",
				by: "gerente@nebula.test",
			},
		]);
	});

	/** Building a real inspection would mean building a journal, which is what the bed is for. */
	it("refuses to inspect, saying where to go instead", async () => {
		await expect(new AgentStub().inspect()).rejects.toThrow(/AdkTestBed/);
	});
});
