import "reflect-metadata";
import { afterEach, describe, expect, it } from "vitest";
import type { AdkTestBed } from "./adk-test-bed";
import { AdkTestBedBuilder } from "./adk-test-bed-builder";
import type { ScriptedModel } from "./scripted-model";
import { BillingAgent, ConciergeAgent, WarrantyAgent, storeModule } from "./support/store.fixture";

const ORDER = "A-1042";

let bed: AdkTestBed;

afterEach(async () => {
	await bed?.close();
});

function bedWith(billing: (script: ScriptedModel) => void, concierge?: (script: ScriptedModel) => void) {
	return AdkTestBedBuilder.for(storeModule())
		.withScript(BillingAgent, billing)
		.withScript(WarrantyAgent, (script) => script.mockText("garantia"))
		.withScript(
			ConciergeAgent,
			concierge ??
				((script) => {
					script.mockText("olá");
				}),
		)
		.boot();
}

describe("RunEvents, over the runs the runtime published", () => {
	it("pairs a call with what came back, keeping the arguments and the output", async () => {
		bed = await bedWith((script) => script.mockToolCall("find_order", { orderId: ORDER }).mockText("349 reais"));

		const run = await bed.agent(BillingAgent).ask("quanto custou?");

		const call = run.toolCalls.at(0);
		expect(call?.tool).toBe("find_order");
		expect(call?.args).toEqual({ orderId: ORDER });
		expect(call?.output).toEqual({ orderId: ORDER, totalBrl: 349 });
		expect(call?.outcome).toBe("succeeded");
	});

	it("keeps a call waiting on a human as pending rather than as run", async () => {
		bed = await bedWith((script) =>
			script.mockToolCall("issue_refund", { orderId: ORDER, amountBrl: 349 }).mockText("feito"),
		);

		const run = await bed.agent(BillingAgent).ask("devolve");

		expect(run.toolCalls.at(0)?.outcome).toBe("pending");
		expect(run.toolsRequested).toEqual(["issue_refund"]);
		expect(run.toolsRun).toEqual([]);
		expect(run.events.toolsAwaitingApproval).toEqual(["issue_refund"]);
	});

	it("carries the refusal and its reason, and the refusal is not a run", async () => {
		bed = await bedWith((script) =>
			script.mockToolCall("issue_refund", { orderId: ORDER, amountBrl: 349 }).mockText("entendi"),
		);
		const billing = bed.agent(BillingAgent);
		await billing.ask("devolve");

		const resumed = await billing.reject("fora da janela de sete dias");

		const call = resumed.callsTo("issue_refund").at(0);
		expect(call?.outcome).toBe("denied");
		expect(call?.deniedReason).toBe("fora da janela de sete dias");
		expect(resumed.events.denied("issue_refund")).toBe(1);
		expect(resumed.toolsRun).not.toContain("issue_refund");
	});

	it("counts a call that ran once per time it ran", async () => {
		bed = await bedWith((script) =>
			script
				.mockToolCall("find_order", { orderId: ORDER })
				.mockToolCall("find_order", { orderId: "A-77" })
				.mockText("dois pedidos"),
		);

		const run = await bed.agent(BillingAgent).ask("procura os dois");

		expect(run.events.ran("find_order")).toBe(2);
		expect(run.callsTo("find_order")).toHaveLength(2);
	});

	it("says how many tools one turn asked for at once", async () => {
		bed = await bedWith((script) =>
			script
				.mockToolCalls([
					{ tool: "find_order", args: { orderId: ORDER } },
					{ tool: "find_order", args: { orderId: "A-77" } },
				])
				.mockText("os dois"),
		);

		const run = await bed.agent(BillingAgent).ask("procura os dois de uma vez");

		expect(run.events.largestBatch).toBe(2);
	});

	it("keeps what was said, on both sides of the conversation", async () => {
		bed = await bedWith((script) => script.mockText("custou 349 reais"));

		const run = await bed.agent(BillingAgent).ask("quanto custou?");

		expect(run.events.userMessages).toContain("quanto custou?");
		expect(run.events.assistantMessages).toContain("custou 349 reais");
	});

	it("narrows to one session, for a suite that ran several conversations", async () => {
		bed = await bedWith((script) => script.mockText("primeira").mockText("segunda"));
		const billing = bed.agent(BillingAgent);

		const first = await billing.ask("uma");
		await billing.newSession().ask("outra");

		expect(bed.events.forSession(first.sessionId.value).userMessages).toEqual(["uma"]);
	});

	it("narrows to one run, which is what a recorded run is", async () => {
		bed = await bedWith((script) => script.mockText("primeira").mockText("segunda"));
		const billing = bed.agent(BillingAgent);
		const first = await billing.ask("uma");

		await billing.ask("outra");

		expect(bed.events.forRun(first.runId.value).userMessages).toEqual(["uma"]);
	});

	it("counts events by type, for a question the vocabulary does not name", async () => {
		bed = await bedWith((script) => script.mockText("pronto"));

		const run = await bed.agent(BillingAgent).ask("oi");

		expect(run.events.countOf("run.assistant-message-produced")).toBe(1);
		expect(run.events.types).toContain("session.user-message-received");
		expect(run.events.all.length).toBeGreaterThan(0);
	});

	it("forgets everything when a test asks it to", async () => {
		bed = await bedWith((script) => script.mockText("pronto"));
		await bed.agent(BillingAgent).ask("oi");

		bed.events.clear();

		expect(bed.events.all).toEqual([]);
	});
});

describe("RecordedRun, as the result production hands back", () => {
	it("is the AgentResult a service reads, with the evidence alongside", async () => {
		bed = await bedWith((script) => script.mockToolCall("find_order", { orderId: ORDER }).mockText("349 reais"));

		const run = await bed.agent(BillingAgent).ask("quanto custou?");

		expect(run.text).toBe("349 reais");
		expect(run.status.name).toBe("completed");
		expect(run.sessionId.value).toBeTruthy();
		expect(run.runId.value).toBeTruthy();
		expect(run.isAwaitingApproval).toBe(false);
	});

	it("finds the call a human has to answer about, by tool or by there being one", async () => {
		bed = await bedWith((script) =>
			script.mockToolCall("issue_refund", { orderId: ORDER, amountBrl: 349 }).mockText("feito"),
		);

		const run = await bed.agent(BillingAgent).ask("devolve");

		expect(run.pendingCall().toolName).toBe("issue_refund");
		expect(run.pendingCall("issue_refund").callId.value).toBeTruthy();
	});

	it("fails naming what it is waiting on when asked about another tool", async () => {
		bed = await bedWith((script) =>
			script.mockToolCall("issue_refund", { orderId: ORDER, amountBrl: 349 }).mockText("feito"),
		);

		const run = await bed.agent(BillingAgent).ask("devolve");

		expect(() => run.pendingCall("find_order")).toThrow(/issue_refund/);
	});
});
