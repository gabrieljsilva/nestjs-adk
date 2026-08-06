import "reflect-metadata";
import { RunLimits } from "@nestjs-adk/core";
import { Test } from "@nestjs/testing";
import { afterEach, describe, expect, it } from "vitest";
import type { AdkTestBed } from "./adk-test-bed";
import { AdkTestBedBuilder } from "./adk-test-bed-builder";
import { ScriptExhaustedError } from "./errors/script-exhausted.error";
import { ScriptNotConsumedError } from "./errors/script-not-consumed.error";
import { UnknownTestAgentError } from "./errors/unknown-test-agent.error";
import { UnscriptedAgentError } from "./errors/unscripted-agent.error";
import { ScriptedModel } from "./scripted-model";
import {
	BillingAgent,
	ConciergeAgent,
	FindOrderTool,
	IssueRefundTool,
	OrderService,
	SendMessageUseCase,
	WarrantyAgent,
	storeModule,
} from "./support/store.fixture";
import { ToolFake } from "./tool-fake";

const ORDER = "A-1042";

let bed: AdkTestBed;

afterEach(async () => {
	await bed?.close();
});

type Queue = (script: ScriptedModel) => void;

/** One text turn, which is the least a scripted agent needs to answer at all. */
function says(text: string): Queue {
	return (script) => {
		script.mockText(text);
	};
}

/**
 * Every agent scripted, which is the shape a free suite always has.
 *
 * Each agent is named once here rather than by a chain of calls, because a script grows by
 * appending: naming the same agent twice would queue both turns on it.
 */
function scriptedBed(scripts: { billing?: Queue; warranty?: Queue; concierge?: Queue } = {}): AdkTestBedBuilder {
	return AdkTestBedBuilder.for(storeModule())
		.withScript(BillingAgent, scripts.billing ?? says("pronto"))
		.withScript(WarrantyAgent, scripts.warranty ?? says("garantia de 90 dias"))
		.withScript(ConciergeAgent, scripts.concierge ?? says("olá"));
}

describe("AdkTestBed, over the application it booted", () => {
	it("answers a question through the agent the application declared", async () => {
		bed = await AdkTestBedBuilder.for(storeModule())
			.withScript(BillingAgent, (script) =>
				script.mockToolCall("find_order", { orderId: ORDER }).mockText("O pedido custou 349 reais."),
			)
			.withScript(WarrantyAgent, (script) => script.mockText("ok"))
			.withScript(ConciergeAgent, (script) => script.mockText("ok"))
			.boot();

		const run = await bed.agent(BillingAgent).ask(`Quanto custou o pedido ${ORDER}?`);

		expect(run.text).toContain("349");
		expect(run.toolsRun).toEqual(["find_order"]);
	});

	it("carries the evidence of the run it answered, not of every run in the suite", async () => {
		bed = await scriptedBed({
			billing: (script) =>
				script.mockToolCall("find_order", { orderId: ORDER }).mockText("pronto").mockText("segunda resposta"),
		}).boot();
		const billing = bed.agent(BillingAgent);

		const first = await billing.ask("primeira");
		const second = await billing.newSession().ask("segunda");

		expect(first.toolsRun).toEqual(["find_order"]);
		expect(second.toolsRun).toEqual([]);
		expect(bed.events.ran("find_order")).toBe(1);
	});

	it("keeps one conversation across questions, and opens another when told to", async () => {
		bed = await scriptedBed({
			concierge: (script) => script.mockText("olá").mockText("de novo").mockText("nova conversa"),
		}).boot();
		const concierge = bed.agent(ConciergeAgent);

		const first = await concierge.ask("oi");
		const second = await concierge.ask("de novo");
		const third = await concierge.newSession().ask("outra");

		expect(second.sessionId.value).toBe(first.sessionId.value);
		expect(third.sessionId.value).not.toBe(first.sessionId.value);
	});

	it("hands back the same handle for the same agent, so a follow up continues the conversation", async () => {
		bed = await scriptedBed().boot();

		expect(bed.agent(BillingAgent)).toBe(bed.agent("billing"));
	});

	it("records a run a use case started, which the test never asked for itself", async () => {
		bed = await scriptedBed({ concierge: says("respondido pelo concierge") }).boot();

		const answer = await bed.get(SendMessageUseCase).execute("oi");

		expect(answer).toBe("respondido pelo concierge");
		expect(bed.events.assistantMessages).toContain("respondido pelo concierge");
	});
});

describe("AdkTestBed, holding money in front of a human", () => {
	async function suspended() {
		bed = await scriptedBed({
			billing: (script) =>
				script.mockToolCall("issue_refund", { orderId: ORDER, amountBrl: 349 }).mockText("Reembolso feito."),
		}).boot();
		const billing = bed.agent(BillingAgent);
		return { billing, run: await billing.ask(`Devolve os 349 reais do pedido ${ORDER}.`) };
	}

	it("stops before the money leaves, with the call it is waiting on", async () => {
		const { run } = await suspended();

		expect(run.status.name).toBe("suspended");
		expect(run.pendingCall("issue_refund").toolName).toBe("issue_refund");
		expect(run.toolsRun).not.toContain("issue_refund");
		expect(bed.get(OrderService).refunded).toEqual([]);
	});

	it("lets the money leave once a human said yes, named by tool rather than by call id", async () => {
		const { billing } = await suspended();

		const resumed = await billing.approve("issue_refund", "gerente@nebula.test");

		expect(resumed.status.name).toBe("completed");
		expect(resumed.toolsRun).toContain("issue_refund");
		expect(bed.get(OrderService).refunded).toEqual([{ orderId: ORDER, amountBrl: 349 }]);
	});

	it("keeps the money when a human said no, and the conversation carries on", async () => {
		const { billing } = await suspended();

		const resumed = await billing.reject("fora da janela de sete dias");

		expect(resumed.status.name).toBe("completed");
		expect(resumed.events.denied("issue_refund")).toBe(1);
		expect(bed.get(OrderService).refunded).toEqual([]);
	});

	it("fails clearly when a decision is asked for on a run waiting for nothing", async () => {
		bed = await scriptedBed().boot();
		const billing = bed.agent(BillingAgent);
		await billing.ask("oi");

		await expect(billing.approve()).rejects.toThrow(/not waiting/);
	});
});

describe("AdkTestBed, mixing models across agents", () => {
	it("routes one agent to its own script, transfer included", async () => {
		bed = await AdkTestBedBuilder.for(storeModule())
			.withScript(ConciergeAgent, (script) =>
				script.mockToolCall("transfer_to_agent", { agentName: "warranty" }).mockText("passei para a garantia"),
			)
			.withScript(WarrantyAgent, (script) => script.mockText("cobrimos o reparo"))
			.withScript(BillingAgent, (script) => script.mockText("não deveria falar"))
			.boot();

		const run = await bed.agent(ConciergeAgent).ask("meu produto quebrou");

		expect(run.transfers).toContain("warranty");
		expect(bed.script(BillingAgent)?.requests).toHaveLength(0);
	});

	it("routes a delegated agent to its own script, so turns never slip between agents", async () => {
		bed = await AdkTestBedBuilder.for(storeModule())
			.withScript(ConciergeAgent, (script) =>
				script
					.mockToolCall("delegate_to_agent", { agentName: "billing", task: "qual o teto do plano gold?" })
					.mockText("o teto é 1437 reais"),
			)
			.withScript(BillingAgent, (script) => script.mockText("o teto do gold é 1437 reais"))
			.withScript(WarrantyAgent, (script) => script.mockText("não deveria falar"))
			.boot();

		const run = await bed.agent(ConciergeAgent).ask("qual o teto do plano gold?");

		expect(run.delegations).toContain("billing");
		expect(bed.script(BillingAgent)?.requests).toHaveLength(1);
		expect(bed.script(WarrantyAgent)?.requests).toHaveLength(0);
	});

	it("leaves an agent nobody routed on what the application resolved for it", async () => {
		bed = await AdkTestBedBuilder.for(storeModule())
			.withModel(new ScriptedModel("fallback").mockText("do fallback"))
			.withScript(BillingAgent, (script) => script.mockText("do script"))
			.boot();

		expect((await bed.agent(BillingAgent).ask("oi")).text).toBe("do script");
		expect((await bed.agent(WarrantyAgent).ask("oi")).text).toBe("do fallback");
	});
});

describe("AdkTestBed, refusing to boot something a test did not mean", () => {
	it("refuses an agent whose model the test did not choose", async () => {
		await expect(
			AdkTestBedBuilder.for(storeModule())
				.withScript(BillingAgent, (script) => script.mockText("ok"))
				.overriding(OrderService, new OrderService())
				.boot(),
		).rejects.toThrow(UnscriptedAgentError);
	});

	it("names the agents that would have answered on a model nobody chose", async () => {
		await expect(
			AdkTestBedBuilder.for(storeModule())
				.withScript(BillingAgent, (script) => script.mockText("ok"))
				.boot(),
		).rejects.toThrow(/concierge/);
	});

	it("boots anyway when the suite says out loud that it spends money", async () => {
		bed = await AdkTestBedBuilder.for(storeModule())
			.withModel(new ScriptedModel("fallback").mockText("ok"))
			.allowingUnscriptedModels()
			.boot();

		expect(bed.events.types).toEqual([]);
	});

	it("refuses a name no agent declared, at boot rather than at the third question", async () => {
		await expect(
			scriptedBed()
				.withScript("bilingg", (script) => script.mockText("typo"))
				.boot(),
		).rejects.toThrow(UnknownTestAgentError);
	});
});

describe("AdkTestBed, over a script that failed to describe the run", () => {
	it("fails naming the agent when a run asks for a turn nobody queued", async () => {
		bed = await scriptedBed({ billing: (script) => script.mockToolCall("find_order", { orderId: ORDER }) }).boot();

		await expect(bed.agent(BillingAgent).ask("oi")).rejects.toThrow(ScriptExhaustedError);
	});

	it("fails when a queued turn was never played", async () => {
		bed = await scriptedBed({ billing: (script) => script.mockText("primeira").mockText("segunda") }).boot();

		await bed.agent(BillingAgent).ask("oi");

		expect(() => bed.verify()).toThrow(ScriptNotConsumedError);
	});

	it("passes verification once every queued turn was played", async () => {
		bed = await scriptedBed().boot();

		await bed.agent(BillingAgent).ask("oi");
		await bed.agent(WarrantyAgent).ask("oi");
		await bed.agent(ConciergeAgent).ask("oi");

		expect(() => bed.verify()).not.toThrow();
	});
});

describe("AdkTestBed, replacing what a tool does", () => {
	it("calls the double instead of the tool, and keeps what the model chose", async () => {
		const refund = ToolFake.replacing(IssueRefundTool).succeedsWith({ refunded: true });
		bed = await scriptedBed({
			billing: (script) => script.mockToolCall("issue_refund", { orderId: ORDER, amountBrl: 349 }).mockText("feito"),
		})
			.replaceTool(IssueRefundTool, refund)
			.boot();

		await bed.agent(BillingAgent).ask("devolve");
		await bed.agent(BillingAgent).approve("issue_refund");

		expect(refund.lastArgs()).toEqual({ orderId: ORDER, amountBrl: 349 });
		expect(bed.get(OrderService).refunded).toEqual([]);
	});

	it("answers the arguments of the real tool from the run itself, with no double at all", async () => {
		bed = await scriptedBed({
			billing: (script) => script.mockToolCall("find_order", { orderId: ORDER }).mockText("pronto"),
		}).boot();

		const run = await bed.agent(BillingAgent).ask("procura");

		expect(run.callsTo("find_order").at(0)?.args).toEqual({ orderId: ORDER });
		expect(run.callsTo("find_order").at(0)?.output).toEqual({ orderId: ORDER, totalBrl: 349 });
	});

	it("hands the run a failure the tool raised, rather than ending it", async () => {
		const broken = ToolFake.replacing(FindOrderTool).failsWith(new Error("índice fora do ar"));
		bed = await scriptedBed({
			billing: (script) => script.mockToolCall("find_order", { orderId: ORDER }).mockText("desculpe"),
		})
			.replaceTool(FindOrderTool, broken)
			.boot();

		const run = await bed.agent(BillingAgent).ask("procura");

		expect(run.status.name).toBe("completed");
		expect(run.callsTo("find_order").at(0)?.outcome).toBe("failed");
	});
});

describe("AdkTestBed, over what the application declared", () => {
	it("passes any other token straight through to the NestJS builder", async () => {
		const orders = new OrderService();
		bed = await scriptedBed().overriding(OrderService, orders).boot();

		expect(bed.get(OrderService)).toBe(orders);
	});

	it("wraps a builder the test had already configured", async () => {
		const orders = new OrderService();
		const builder = Test.createTestingModule(storeModule()).overrideProvider(OrderService).useValue(orders);

		bed = await AdkTestBedBuilder.from(builder)
			.withScript(BillingAgent, (script) => script.mockText("ok"))
			.withScript(WarrantyAgent, (script) => script.mockText("ok"))
			.withScript(ConciergeAgent, (script) => script.mockText("ok"))
			.boot();

		expect(bed.get(OrderService)).toBe(orders);
	});

	it("replaces runtime fields by name, leaving the approval policy the application declared", async () => {
		bed = await scriptedBed({
			billing: (script) => script.mockToolCall("issue_refund", { orderId: ORDER, amountBrl: 349 }).mockText("feito"),
		})
			.withRuntime({ limits: RunLimits.of(2) })
			.boot();

		const run = await bed.agent(BillingAgent).ask("devolve");

		expect(run.status.name).toBe("suspended");
	});
});
