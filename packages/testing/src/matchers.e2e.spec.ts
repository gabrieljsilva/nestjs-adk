import "reflect-metadata";
import "./matchers";
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

/**
 * The matchers over a run the runtime produced, which is the only way to prove them.
 *
 * Everything here reads the events a real run published, so the same assertions hold when
 * a provider decides instead of a script: that is what the vocabulary is for.
 */
describe("the matchers, over what a run actually did", () => {
	it("passes for a tool that ran, with and without the arguments", async () => {
		bed = await bedWith((script) => script.mockToolCall("find_order", { orderId: ORDER }).mockText("349 reais"));

		const run = await bed.agent(BillingAgent).ask("quanto custou?");

		expect(run).toHaveRunTool("find_order");
		expect(run).toHaveRunTool("find_order", { orderId: ORDER });
		expect(run).not.toHaveRunTool("issue_refund");
	});

	it("fails naming the arguments the tool actually got", async () => {
		bed = await bedWith((script) => script.mockToolCall("find_order", { orderId: ORDER }).mockText("pronto"));
		const run = await bed.agent(BillingAgent).ask("quanto custou?");

		expect(() => expect(run).toHaveRunTool("find_order", { orderId: "A-9" })).toThrow(/A-1042/);
	});

	it("tells a tool that was asked for apart from one that ran", async () => {
		bed = await bedWith((script) =>
			script.mockToolCall("issue_refund", { orderId: ORDER, amountBrl: 349 }).mockText("feito"),
		);

		const run = await bed.agent(BillingAgent).ask("devolve");

		expect(run).toHaveRequestedTool("issue_refund");
		expect(run).not.toHaveRunTool("issue_refund");
		expect(run).toAwaitApproval("issue_refund");
	});

	it("passes for a call a human refused", async () => {
		bed = await bedWith((script) =>
			script.mockToolCall("issue_refund", { orderId: ORDER, amountBrl: 349 }).mockText("entendi"),
		);
		const billing = bed.agent(BillingAgent);
		await billing.ask("devolve");

		const resumed = await billing.reject("fora da janela");

		expect(resumed).toHaveDeniedTool("issue_refund");
		expect(resumed).toHaveStatus("completed");
	});

	it("passes for a session that changed hands", async () => {
		bed = await bedWith(
			(script) => script.mockText("não deveria falar"),
			(script) => script.mockToolCall("transfer_to_agent", { agentName: "warranty" }).mockText("passei adiante"),
		);

		const run = await bed.agent(ConciergeAgent).ask("meu produto quebrou");

		expect(run).toHaveTransferredTo("warranty");
		expect(run).not.toHaveDelegatedTo("billing");
	});

	it("passes for a task handed to a specialist", async () => {
		bed = await bedWith(
			(script) => script.mockText("o teto é 1437 reais"),
			(script) =>
				script
					.mockToolCall("delegate_to_agent", { agentName: "billing", task: "qual o teto?" })
					.mockText("o teto é 1437 reais"),
		);

		const run = await bed.agent(ConciergeAgent).ask("qual o teto?");

		expect(run).toHaveDelegatedTo("billing");
	});

	it("reads the bed's own events, for a run the test never started", async () => {
		bed = await bedWith((script) => script.mockToolCall("find_order", { orderId: ORDER }).mockText("pronto"));

		await bed.agent(BillingAgent).ask("quanto custou?");

		expect(bed.events).toHaveRunTool("find_order");
	});

	it("says a script still holds turns nobody played", async () => {
		bed = await bedWith((script) => script.mockText("primeira").mockText("nunca alcançada"));

		await bed.agent(BillingAgent).ask("oi");

		expect(bed.agent(BillingAgent)).not.toBeFullyPlayed();
	});
});
