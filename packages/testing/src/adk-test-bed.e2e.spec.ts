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
		.withScript(BillingAgent, scripts.billing ?? says("done"))
		.withScript(WarrantyAgent, scripts.warranty ?? says("90-day warranty"))
		.withScript(ConciergeAgent, scripts.concierge ?? says("hello"));
}

describe("AdkTestBed, over the application it booted", () => {
	it("answers a question through the agent the application declared", async () => {
		bed = await AdkTestBedBuilder.for(storeModule())
			.withScript(BillingAgent, (script) =>
				script.mockToolCall("find_order", { orderId: ORDER }).mockText("The order cost 349 reais."),
			)
			.withScript(WarrantyAgent, (script) => script.mockText("ok"))
			.withScript(ConciergeAgent, (script) => script.mockText("ok"))
			.boot();

		const run = await bed.agent(BillingAgent).ask(`How much did order ${ORDER} cost?`);

		expect(run.text).toContain("349");
		expect(run.toolsRun).toEqual(["find_order"]);
	});

	it("carries the evidence of the run it answered, not of every run in the suite", async () => {
		bed = await scriptedBed({
			billing: (script) =>
				script.mockToolCall("find_order", { orderId: ORDER }).mockText("done").mockText("second response"),
		}).boot();
		const billing = bed.agent(BillingAgent);

		const first = await billing.ask("first");
		const second = await billing.newSession().ask("second");

		expect(first.toolsRun).toEqual(["find_order"]);
		expect(second.toolsRun).toEqual([]);
		expect(bed.events.ran("find_order")).toBe(1);
	});

	it("keeps one conversation across questions, and opens another when told to", async () => {
		bed = await scriptedBed({
			concierge: (script) => script.mockText("hello").mockText("again").mockText("new conversation"),
		}).boot();
		const concierge = bed.agent(ConciergeAgent);

		const first = await concierge.ask("hi");
		const second = await concierge.ask("again");
		const third = await concierge.newSession().ask("another");

		expect(second.sessionId.value).toBe(first.sessionId.value);
		expect(third.sessionId.value).not.toBe(first.sessionId.value);
	});

	it("hands back the same handle for the same agent, so a follow up continues the conversation", async () => {
		bed = await scriptedBed().boot();

		expect(bed.agent(BillingAgent)).toBe(bed.agent("billing"));
	});

	it("records a run a use case started, which the test never asked for itself", async () => {
		bed = await scriptedBed({ concierge: says("answered by the concierge") }).boot();

		const answer = await bed.get(SendMessageUseCase).execute("hi");

		expect(answer).toBe("answered by the concierge");
		expect(bed.events.assistantMessages).toContain("answered by the concierge");
	});
});

describe("AdkTestBed, holding money in front of a human", () => {
	async function suspended() {
		bed = await scriptedBed({
			billing: (script) =>
				script.mockToolCall("issue_refund", { orderId: ORDER, amountBrl: 349 }).mockText("Refund completed."),
		}).boot();
		const billing = bed.agent(BillingAgent);
		return { billing, run: await billing.ask(`Refund the 349 reais from order ${ORDER}.`) };
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

		const resumed = await billing.approve("issue_refund", "manager@nebula.test");

		expect(resumed.status.name).toBe("completed");
		expect(resumed.toolsRun).toContain("issue_refund");
		expect(bed.get(OrderService).refunded).toEqual([{ orderId: ORDER, amountBrl: 349 }]);
	});

	it("keeps the money when a human said no, and the conversation carries on", async () => {
		const { billing } = await suspended();

		const resumed = await billing.reject("outside the seven-day window");

		expect(resumed.status.name).toBe("completed");
		expect(resumed.events.denied("issue_refund")).toBe(1);
		expect(bed.get(OrderService).refunded).toEqual([]);
	});

	it("fails clearly when a decision is asked for on a run waiting for nothing", async () => {
		bed = await scriptedBed().boot();
		const billing = bed.agent(BillingAgent);
		await billing.ask("hi");

		await expect(billing.approve()).rejects.toThrow(/not waiting/);
	});
});

describe("AdkTestBed, mixing models across agents", () => {
	it("routes one agent to its own script, transfer included", async () => {
		bed = await AdkTestBedBuilder.for(storeModule())
			.withScript(ConciergeAgent, (script) =>
				script.mockToolCall("transfer_to_agent", { agentName: "warranty" }).mockText("transferred to warranty"),
			)
			.withScript(WarrantyAgent, (script) => script.mockText("we cover the repair"))
			.withScript(BillingAgent, (script) => script.mockText("should not speak"))
			.boot();

		const run = await bed.agent(ConciergeAgent).ask("my product broke");

		expect(run.transfers).toContain("warranty");
		expect(bed.script(BillingAgent)?.requests).toHaveLength(0);
	});

	it("routes a delegated agent to its own script, so turns never slip between agents", async () => {
		bed = await AdkTestBedBuilder.for(storeModule())
			.withScript(ConciergeAgent, (script) =>
				script
					.mockToolCall("delegate_to_agent", { agentName: "billing", task: "what is the gold plan limit?" })
					.mockText("the limit is 1437 reais"),
			)
			.withScript(BillingAgent, (script) => script.mockText("the gold limit is 1437 reais"))
			.withScript(WarrantyAgent, (script) => script.mockText("should not speak"))
			.boot();

		const run = await bed.agent(ConciergeAgent).ask("what is the gold plan limit?");

		expect(run.delegations).toContain("billing");
		expect(bed.script(BillingAgent)?.requests).toHaveLength(1);
		expect(bed.script(WarrantyAgent)?.requests).toHaveLength(0);
	});

	it("leaves an agent nobody routed on what the application resolved for it", async () => {
		bed = await AdkTestBedBuilder.for(storeModule())
			.withModel(new ScriptedModel("fallback").mockText("from fallback"))
			.withScript(BillingAgent, (script) => script.mockText("from script"))
			.boot();

		expect((await bed.agent(BillingAgent).ask("hi")).text).toBe("from script");
		expect((await bed.agent(WarrantyAgent).ask("hi")).text).toBe("from fallback");
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

		await expect(bed.agent(BillingAgent).ask("hi")).rejects.toThrow(ScriptExhaustedError);
	});

	it("fails when a queued turn was never played", async () => {
		bed = await scriptedBed({ billing: (script) => script.mockText("first").mockText("second") }).boot();

		await bed.agent(BillingAgent).ask("hi");

		expect(() => bed.verify()).toThrow(ScriptNotConsumedError);
	});

	it("passes verification once every queued turn was played", async () => {
		bed = await scriptedBed().boot();

		await bed.agent(BillingAgent).ask("hi");
		await bed.agent(WarrantyAgent).ask("hi");
		await bed.agent(ConciergeAgent).ask("hi");

		expect(() => bed.verify()).not.toThrow();
	});
});

describe("AdkTestBed, replacing what a tool does", () => {
	it("calls the double instead of the tool, and keeps what the model chose", async () => {
		const refund = ToolFake.replacing(IssueRefundTool).succeedsWith({ refunded: true });
		bed = await scriptedBed({
			billing: (script) => script.mockToolCall("issue_refund", { orderId: ORDER, amountBrl: 349 }).mockText("completed"),
		})
			.replaceTool(IssueRefundTool, refund)
			.boot();

		await bed.agent(BillingAgent).ask("refund it");
		await bed.agent(BillingAgent).approve("issue_refund");

		expect(refund.lastArgs()).toEqual({ orderId: ORDER, amountBrl: 349 });
		expect(bed.get(OrderService).refunded).toEqual([]);
	});

	it("answers the arguments of the real tool from the run itself, with no double at all", async () => {
		bed = await scriptedBed({
			billing: (script) => script.mockToolCall("find_order", { orderId: ORDER }).mockText("done"),
		}).boot();

		const run = await bed.agent(BillingAgent).ask("find it");

		expect(run.callsTo("find_order").at(0)?.args).toEqual({ orderId: ORDER });
		expect(run.callsTo("find_order").at(0)?.output).toEqual({ orderId: ORDER, totalBrl: 349 });
	});

	it("hands the run a failure the tool raised, rather than ending it", async () => {
		const broken = ToolFake.replacing(FindOrderTool).failsWith(new Error("index is unavailable"));
		bed = await scriptedBed({
			billing: (script) => script.mockToolCall("find_order", { orderId: ORDER }).mockText("sorry"),
		})
			.replaceTool(FindOrderTool, broken)
			.boot();

		const run = await bed.agent(BillingAgent).ask("find it");

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
			billing: (script) => script.mockToolCall("issue_refund", { orderId: ORDER, amountBrl: 349 }).mockText("completed"),
		})
			.withRuntime({ limits: RunLimits.of(2) })
			.boot();

		const run = await bed.agent(BillingAgent).ask("refund it");

		expect(run.status.name).toBe("suspended");
	});

	it("hands back the pieces a streamed answer arrived in, along with the run they add up to", async () => {
		bed = await scriptedBed({
			warranty: (script) => script.mockStream(["A garantia ", "é de 90 ", "dias."]),
		}).boot();

		const run = await bed.agent(WarrantyAgent).stream("qual a garantia?");

		expect(run.textDeltas).toEqual(["A garantia ", "é de 90 ", "dias."]);
		expect(run.text).toBe("A garantia é de 90 dias.");
		expect(run.wasStreamed).toBe(true);
	});

	/**
	 * The result is the generator's return value, which a `for await` throws away. Losing it
	 * would leave a test asserting on nothing, so this holds the bed to handing it back.
	 */
	it("keeps the result a streamed run ended with, and the evidence of what it did", async () => {
		bed = await scriptedBed({
			billing: (script) => script.mockToolCall("find_order", { orderId: ORDER }).mockStream(["Custou ", "349 ", "reais."]),
		}).boot();

		const run = await bed.agent(BillingAgent).stream(`quanto custou o pedido ${ORDER}?`);

		expect(run.status.name).toBe("completed");
		expect(run.toolsRun).toEqual(["find_order"]);
		expect(run.sessionId.value.length).toBeGreaterThan(0);
	});

	/** A caller that paints only the last chunk passes the case above unless one piece is told from many. */
	it("reports a turn that was not streamed as the single piece it was", async () => {
		bed = await scriptedBed({ warranty: says("A garantia é de 90 dias.") }).boot();

		const run = await bed.agent(WarrantyAgent).stream("qual a garantia?");

		expect(run.textDeltas).toEqual(["A garantia é de 90 dias."]);
		expect(run.wasStreamed).toBe(false);
	});

	it("streams into the conversation it is already holding", async () => {
		bed = await scriptedBed({
			concierge: (script) => script.mockText("olá").mockStream(["ainda ", "aqui"]),
		}).boot();
		const concierge = bed.agent(ConciergeAgent);

		const first = await concierge.ask("oi");
		const second = await concierge.stream("e agora?");

		expect(second.sessionId.value).toBe(first.sessionId.value);
		expect(second.textDeltas).toEqual(["ainda ", "aqui"]);
	});
});
