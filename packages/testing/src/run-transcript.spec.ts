import { describe, expect, it } from "vitest";
import { RunTranscript } from "./run-transcript";

describe("RunTranscript", () => {
	it("distinguishes the user from the agent that answered", async () => {
		const printed: string[] = [];
		const transcript = new RunTranscript((line) => printed.push(line));
		const correlation = { runId: { value: "run-1" } };

		await transcript.consume({ type: "run.started", correlation, payload: { agent: "billing" } } as never);
		await transcript.consume({
			type: "session.user-message-received",
			correlation,
			payload: { text: "where is A-1042?" },
		} as never);
		await transcript.consume({
			type: "run.assistant-message-produced",
			correlation,
			payload: { text: "cost 349 reais" },
		} as never);

		expect(printed).toEqual(["  › where is A-1042?", "  ‹ billing: cost 349 reais"]);
	});

	it("prints a tool request and its response as different steps", async () => {
		const printed: string[] = [];
		const transcript = new RunTranscript((line) => printed.push(line));
		const correlation = { runId: { value: "run-1" } };

		await transcript.consume({ type: "run.started", correlation, payload: { agent: "billing" } } as never);
		await transcript.consume({
			type: "tool.call-requested",
			correlation,
			payload: { callId: "call-1", toolName: "find_order", args: { orderId: "A-1042" } },
		} as never);
		await transcript.consume({
			type: "tool.result-produced",
			correlation,
			payload: { callId: "call-1", toolName: "find_order", output: { totalBrl: 349 } },
		} as never);

		expect(printed[0]).toContain("⚙");
		expect(printed[0]).toContain("billing: find_order");
		expect(printed[1]).toContain("↩");
		expect(printed[1]).toContain("349");
	});

	it("names approval requests, approvals and rejections", async () => {
		const printed: string[] = [];
		const transcript = new RunTranscript((line) => printed.push(line));
		const correlation = { runId: { value: "run-1" } };

		await transcript.consume({ type: "run.started", correlation, payload: { agent: "billing" } } as never);
		await transcript.consume({
			type: "tool.call-requested",
			correlation,
			payload: { callId: "call-1", toolName: "issue_refund", args: {} },
		} as never);
		await transcript.consume({
			type: "tool.approval-requested",
			correlation,
			payload: { callId: "call-1", toolName: "issue_refund" },
		} as never);
		await transcript.consume({
			type: "tool.approval-granted",
			correlation,
			payload: { callId: "call-1", approvedBy: "manager" },
		} as never);
		await transcript.consume({
			type: "tool.approval-denied",
			correlation,
			payload: {
				callId: "call-1",
				toolName: "issue_refund",
				deniedBy: "manager",
				reason: "outside the window",
			},
		} as never);

		expect(printed).toEqual([
			expect.stringContaining("⚙"),
			"  ⏸ issue_refund",
			"  ✓ issue_refund by manager",
			"  × issue_refund by manager: outside the window",
		]);
	});

	it("shows transfer and delegation as different operations", async () => {
		const printed: string[] = [];
		const transcript = new RunTranscript((line) => printed.push(line));
		const correlation = { runId: { value: "run-1" } };

		await transcript.consume({ type: "run.started", correlation, payload: { agent: "warranty" } } as never);
		await transcript.consume({
			type: "agent.transferred",
			correlation,
			payload: { from: "warranty", to: "billing" },
		} as never);
		await transcript.consume({
			type: "delegation.started",
			correlation,
			payload: { childRunId: "run-2", toAgent: "billing" },
		} as never);
		await transcript.consume({
			type: "session.user-message-received",
			correlation: { runId: { value: "run-2" } },
			payload: { text: "check the limit" },
		} as never);

		expect(printed).toEqual(["  → warranty → billing", "  ⤳ warranty → billing", "  ⤳ billing: check the limit"]);
	});

	it("omits empty model turns and keeps long output readable on one line", async () => {
		const printed: string[] = [];
		const transcript = new RunTranscript((line) => printed.push(line));
		const correlation = { runId: { value: "run-1" } };

		await transcript.consume({ type: "run.started", correlation, payload: { agent: "sales" } } as never);
		await transcript.consume({
			type: "run.assistant-message-produced",
			correlation,
			payload: { text: "" },
		} as never);
		await transcript.consume({
			type: "run.assistant-message-produced",
			correlation,
			payload: { text: `one\n\n${"word ".repeat(200)}` },
		} as never);

		expect(printed).toHaveLength(1);
		expect(printed[0]?.length).toBeLessThan(270);
		expect(printed[0]).toContain("one word");
		expect(printed[0]).toContain("…");
	});
});
