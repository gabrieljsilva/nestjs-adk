import {
	AgentResult,
	AgentRunId,
	AgentRunStatus,
	ModelRequest,
	PendingCall,
	SessionId,
	ToolCallId,
	ToolResultMessage,
	UserMessage,
} from "@nestjs-adk/core";
import { describe, expect, it } from "vitest";
import { JudgeRubric } from "./judge-rubric";
import { LlmJudge } from "./llm-judge";
import { adkMatchers } from "./matchers";
import { ScriptedModel } from "./scripted-model";

const SESSION = SessionId.from("s-1");
const RUN = AgentRunId.from("r-1");
const CALL = ToolCallId.from("c-1");

function modelThatRan(tool: string): ScriptedModel {
	const model = new ScriptedModel();
	model.requests.push(new ModelRequest([new UserMessage("hi"), new ToolResultMessage(CALL, tool, { ok: true }, false)]));
	return model;
}

function suspendedOn(tool: string): AgentResult {
	return new AgentResult(SESSION, RUN, AgentRunStatus.SUSPENDED, "", [new PendingCall(CALL, tool, {})]);
}

function judgeAnswering(text: string): LlmJudge {
	return new LlmJudge(new ScriptedModel().mockText(text));
}

describe("toCallTool", () => {
	it("passes when the tool actually ran", () => {
		expect(adkMatchers.toCallTool(modelThatRan("refund_order"), "refund_order").pass).toBe(true);
	});

	it("fails when another tool ran, and says which", () => {
		const result = adkMatchers.toCallTool(modelThatRan("lookup_order"), "refund_order");

		expect(result.pass).toBe(false);
		expect(result.message()).toContain("lookup_order");
	});

	it("fails on a subject it cannot read", () => {
		expect(adkMatchers.toCallTool("not a model", "refund_order").pass).toBe(false);
	});
});

describe("toAwaitApproval", () => {
	it("passes for a run waiting on the named tool", () => {
		expect(adkMatchers.toAwaitApproval(suspendedOn("refund_order"), "refund_order").pass).toBe(true);
	});

	it("passes for a run waiting on anything, when no tool was named", () => {
		expect(adkMatchers.toAwaitApproval(suspendedOn("refund_order")).pass).toBe(true);
	});

	it("fails for a run that completed", () => {
		const completed = new AgentResult(SESSION, RUN, AgentRunStatus.COMPLETED, "done");

		const result = adkMatchers.toAwaitApproval(completed);
		expect(result.pass).toBe(false);
		expect(result.message()).toContain("completed");
	});

	it("fails when it is waiting on a different tool", () => {
		expect(adkMatchers.toAwaitApproval(suspendedOn("close_order"), "refund_order").pass).toBe(false);
	});
});

describe("toBeSemanticallyCloseTo", () => {
	it("passes for the same thing said again", async () => {
		expect((await adkMatchers.toBeSemanticallyCloseTo("the order was refunded", "the order was refunded")).pass).toBe(
			true,
		);
	});

	it("fails for a text about something else, and reports the score", async () => {
		const result = await adkMatchers.toBeSemanticallyCloseTo("the order was refunded", "clouds over the mountain");

		expect(result.pass).toBe(false);
		expect(result.message()).toContain("scored");
	});

	it("takes a lower bar when the caller sets one", async () => {
		const loose = await adkMatchers.toBeSemanticallyCloseTo("refund the order", "refund the order today", 0.5);

		expect(loose.pass).toBe(true);
	});
});

describe("toSatisfyRubric", () => {
	it("passes when the judge scored above the threshold", async () => {
		const result = await adkMatchers.toSatisfyRubric(
			"order 42 shipped",
			judgeAnswering('{"score":0.9,"reason":"names it"}'),
			"names the order id",
		);

		expect(result.pass).toBe(true);
	});

	it("fails with the judge's own reason in the message", async () => {
		const result = await adkMatchers.toSatisfyRubric(
			"I looked into it",
			judgeAnswering('{"score":0.1,"reason":"it says nothing about the order"}'),
			JudgeRubric.of("names the order id"),
		);

		expect(result.pass).toBe(false);
		expect(result.message()).toContain("says nothing about the order");
	});
});

describe("registration", () => {
	it("extends expect, so importing the module is all a suite has to do", () => {
		expect(modelThatRan("refund_order")).toCallTool("refund_order");
		expect(suspendedOn("refund_order")).toAwaitApproval("refund_order");
	});
});
