import { describe, expect, it } from "vitest";
import { RunTranscript } from "./run-transcript";

/** A published event as a consumer reads it: a type and a payload, which is all this uses. */
function event(type: string, payload: Record<string, unknown>) {
	return { type, payload } as never;
}

async function linesOf(events: readonly { type: string; payload: Record<string, unknown> }[]): Promise<string[]> {
	const printed: string[] = [];
	const transcript = new RunTranscript((line) => printed.push(line));
	for (const each of events) await transcript.consume(event(each.type, each.payload));
	return printed;
}

describe("RunTranscript", () => {
	it("prints the question, the tools and the answer", async () => {
		const printed = await linesOf([
			{ type: "session.user-message-received", payload: { text: "onde está A-1042?" } },
			{ type: "tool.call-requested", payload: { toolName: "find_order", args: { orderId: "A-1042" } } },
			{ type: "tool.result-produced", payload: { toolName: "find_order", output: { totalBrl: 349 } } },
			{ type: "run.assistant-message-produced", payload: { text: "custou 349 reais" } },
		]);

		expect(printed).toHaveLength(4);
		expect(printed[0]).toContain("onde está A-1042?");
		expect(printed[1]).toContain("find_order");
		expect(printed[1]).toContain("A-1042");
		expect(printed[3]).toContain("349");
	});

	it("prints where a run stopped and where a conversation went", async () => {
		const printed = await linesOf([
			{ type: "tool.approval-requested", payload: { toolName: "issue_refund" } },
			{ type: "agent.transferred", payload: { to: "warranty" } },
			{ type: "delegation.started", payload: { toAgent: "billing" } },
		]);

		expect(printed[0]).toContain("issue_refund");
		expect(printed[1]).toContain("warranty");
		expect(printed[2]).toContain("billing");
	});

	it("says nothing about an event a reader has no use for", async () => {
		expect(await linesOf([{ type: "session.created", payload: {} }])).toEqual([]);
	});

	it("shortens a long answer, because a log nobody can read is not a transcript", async () => {
		const printed = await linesOf([
			{ type: "run.assistant-message-produced", payload: { text: "palavra ".repeat(200) } },
		]);

		expect(printed[0]?.length).toBeLessThan(260);
		expect(printed[0]).toContain("…");
	});

	it("collapses the whitespace a model wrote into one line", async () => {
		const printed = await linesOf([{ type: "run.assistant-message-produced", payload: { text: "uma\n\nresposta" } }]);

		expect(printed[0]).toContain("uma resposta");
	});
});
