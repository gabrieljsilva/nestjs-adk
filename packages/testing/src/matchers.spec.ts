import { AgentResult, AgentRunId, AgentRunStatus, PendingCall, SessionId, ToolCallId } from "@nestjs-adk/core";
import { describe, expect, it } from "vitest";
import { JudgeRubric } from "./judge-rubric";
import { LlmJudge } from "./llm-judge";
import { adkMatchers } from "./matchers";
import { ScriptedModel } from "./scripted-model";
import { IssueRefundTool } from "./support/store.fixture";
import { ToolFake } from "./tool-fake";

const SESSION = SessionId.from("s-1");
const RUN = AgentRunId.from("r-1");
const CALL = ToolCallId.from("c-1");

function suspendedOn(tool: string): AgentResult {
	return new AgentResult(SESSION, RUN, AgentRunStatus.SUSPENDED, "", [new PendingCall(CALL, tool, {})]);
}

function judgeAnswering(text: string): LlmJudge {
	return new LlmJudge(new ScriptedModel().mockText(text));
}

/** The event based matchers are proved over a booted run in `matchers.e2e.spec.ts`. */
describe("matchers over a subject they cannot read", () => {
	it("says what each one expected instead of throwing", () => {
		expect(adkMatchers.toHaveRunTool("not a run", "refund_order").pass).toBe(false);
		expect(adkMatchers.toHaveRunTool("not a run", "refund_order").message()).toContain("RecordedRun");
		expect(adkMatchers.toHaveRequestedTool(42, "refund_order").pass).toBe(false);
		expect(adkMatchers.toHaveDeniedTool(42, "refund_order").pass).toBe(false);
		expect(adkMatchers.toHaveTransferredTo(42, "billing").pass).toBe(false);
		expect(adkMatchers.toHaveDelegatedTo(42, "billing").pass).toBe(false);
		expect(adkMatchers.toAwaitApproval("not a result").pass).toBe(false);
		expect(adkMatchers.toHaveStatus("not a result", "completed").pass).toBe(false);
		expect(adkMatchers.toHaveBeenCalledWithArgs("not a fake", {}).pass).toBe(false);
		expect(adkMatchers.toBeFullyPlayed("not a script").pass).toBe(false);
	});
});

describe("toHaveStatus", () => {
	it("passes for the state the run ended in, and names the other one when it fails", () => {
		const completed = new AgentResult(SESSION, RUN, AgentRunStatus.COMPLETED, "done");

		expect(adkMatchers.toHaveStatus(completed, "completed").pass).toBe(true);
		expect(adkMatchers.toHaveStatus(completed, "suspended").message()).toContain("completed");
	});
});

describe("toHaveBeenCalledWithArgs", () => {
	it("passes when the double was called with these arguments, among others", () => {
		const fake = ToolFake.replacing(IssueRefundTool);
		fake.execute({ orderId: "A-1042", amountBrl: 349 }, undefined as never);

		expect(adkMatchers.toHaveBeenCalledWithArgs(fake, { orderId: "A-1042" }).pass).toBe(true);
		expect(adkMatchers.toHaveBeenCalledWithArgs(fake, { orderId: "A-9" }).pass).toBe(false);
	});

	it("reports the calls it did see", () => {
		const fake = ToolFake.replacing(IssueRefundTool);

		expect(adkMatchers.toHaveBeenCalledWithArgs(fake, { orderId: "A-1" }).message()).toContain("none");
	});
});

describe("toBeFullyPlayed", () => {
	it("passes for a script with nothing left, and counts what is left when it fails", async () => {
		const played = new ScriptedModel();
		const pending = new ScriptedModel().mockText("never reached");

		expect(adkMatchers.toBeFullyPlayed(played).pass).toBe(true);
		expect(adkMatchers.toBeFullyPlayed(pending).pass).toBe(false);
		expect(adkMatchers.toBeFullyPlayed(pending).message()).toContain("1 turn");
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
		expect(suspendedOn("refund_order")).toAwaitApproval("refund_order");
		expect(new ScriptedModel()).toBeFullyPlayed();
	});
});
