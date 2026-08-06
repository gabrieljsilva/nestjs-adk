import "reflect-metadata";
import "@nestjs-adk/testing/matchers";
import { type AdkTestBed, RecordingModel, ToolFake } from "@nestjs-adk/testing";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { OrderRepository } from "../aftersales/order.repository";
import { aiStore, breathe, mixedStore, storeGate, storeModel } from "./ai-suite.fixture";
import { BillingAgent } from "./billing.agent";
import { ConciergeAgent } from "./concierge.agent";
import { SalesAgent } from "./sales.agent";
import { SearchGamesTool } from "./search-games.tool";
import { WarrantyAgent } from "./warranty.agent";

const ORDER = "A-1042";

let bed: AdkTestBed;

/**
 * The testing API itself, against a provider that was not told what to answer.
 *
 * Everything a fake can prove about this API is proved for free in `packages/testing`.
 * What only a provider can answer is whether the same vocabulary holds when nobody wrote
 * the conversation: that a run started by a real model records the tools it reached for
 * with the arguments it chose, that a tool replaced by a double is the one the model
 * calls, and that scripting one agent while another decides for itself works in one run.
 */
describe.runIf(storeGate.present)("AI: the testing API, over a model nobody scripted", () => {
	beforeEach(breathe);

	afterEach(async () => {
		await bed?.close();
	});

	it("records the tools a real model reached for, with what it chose", { timeout: 120_000 }, async () => {
		bed = await aiStore().boot();

		const run = await bed.agent(SalesAgent).ask("Quanto custa uma cópia de Stardew Valley?");

		expect(run).toHaveRunTool("quote_game");
		expect(run.callsTo("quote_game").at(0)?.args).toBeDefined();
		expect(run.callsTo("quote_game").at(0)?.outcome).toBe("succeeded");
		expect(run.events.assistantMessages.length).toBeGreaterThan(0);
	});

	/**
	 * A double under a provider that chose to call it.
	 *
	 * The model decides the arguments and the double decides the answer, which is the
	 * combination a fake alone cannot produce: what the shelf answers is fixed, and whether
	 * the model asked the right thing is still the provider's decision.
	 */
	it(
		"calls the double the test put behind a tool, with the arguments the model chose",
		{ timeout: 120_000 },
		async () => {
			const search = ToolFake.replacing(SearchGamesTool).succeedsWith({
				games: [{ slug: "cyber-drift", title: "Cyber Drift", platform: "PS5", priceBrl: 199.9 }],
			});
			bed = await aiStore().replaceTool(SearchGamesTool, search).boot();

			const run = await bed.agent(SalesAgent).ask("Que jogos de PS5 vocês têm? Cite os títulos.");

			expect(search.callCount).toBeGreaterThan(0);
			expect(run.text).toContain("Cyber Drift");
		},
	);

	it(
		"keeps a copy of the traffic, which is what a recorded replay would be built on",
		{ timeout: 120_000 },
		async () => {
			const recording = new RecordingModel(storeModel());
			bed = await mixedStore()
				.withModel(recording)
				.withModelFor("concierge", recording)
				.withModelFor("sales", recording)
				.withModelFor("warranty", recording)
				.withModelFor("billing", recording)
				.boot();

			await bed.agent(SalesAgent).ask("Oi, tudo bem?");

			expect(recording.callCount).toBeGreaterThan(0);
			expect(recording.calls.at(0)?.chunks.length).toBeGreaterThan(0);
			expect(JSON.stringify(recording)).toContain("calls");
		},
	);

	it("holds a real refund in front of a human and resumes it by tool name", { timeout: 120_000 }, async () => {
		bed = await aiStore().boot();
		const billing = bed.agent(BillingAgent);
		const run = await billing.ask(`Devolve os 349 reais do pedido ${ORDER}.`);
		expect(run).toAwaitApproval("issue_refund");

		const resumed = await billing.approve("issue_refund", "gerente@nebula.test");

		expect(resumed).toHaveRunTool("issue_refund");
		expect(bed.get(OrderRepository).findById(ORDER)?.isRefunded).toBe(true);
	});
});

/**
 * One conversation, two kinds of model.
 *
 * The runtime resolves the model of an agent every time one is reached, so a transfer and
 * a delegation each ask again. That is what makes a mixed run possible at all, and it is
 * the case a test bed exists for: paying for the decision that is worth paying for, and
 * scripting the answer that is not.
 */
describe.runIf(storeGate.present)("AI: a real model deciding, scripts answering", () => {
	beforeEach(breathe);

	afterEach(async () => {
		await bed?.close();
	});

	it("routes a real concierge to a scripted sector, and the script answers", { timeout: 120_000 }, async () => {
		bed = await mixedStore()
			.withModel(storeModel())
			.withModelFor("concierge", storeModel())
			.withScript(WarrantyAgent, (script) => script.mockText("Vamos trocar o seu controle em até sete dias."))
			.withScript(SalesAgent, (script) => script.mockText("nada a vender agora"))
			.withScript(BillingAgent, (script) => script.mockText("nada a cobrar agora"))
			.boot();

		const run = await bed.agent(ConciergeAgent).ask("Meu controle chegou quebrado, o analógico está solto.");

		expect(run).toHaveTransferredTo("warranty");
		expect(run.text).toContain("sete dias");
		expect(bed.script(WarrantyAgent)?.requests).toHaveLength(1);
	});

	it("lets a real sector delegate to a scripted one, and reads the answer back", { timeout: 120_000 }, async () => {
		bed = await mixedStore()
			.withModel(storeModel())
			.withModelFor("warranty", storeModel())
			.withScript(BillingAgent, (script) => script.mockText("O teto do plano gold é 1437 reais."))
			.withScript(SalesAgent, (script) => script.mockText("nada a vender agora"))
			.withScript(ConciergeAgent, (script) => script.mockText("nada a rotear agora"))
			.boot();

		const run = await bed.agent(WarrantyAgent).ask("Quanto o plano gold pode receber de volta?");

		expect(run).toHaveDelegatedTo("billing");
		expect(run.text).toMatch(/1\.?437/);
		expect(bed.script(BillingAgent)?.requests).toHaveLength(1);
	});

	/** The inverse: the decision is scripted, and the sector that answers is the real one. */
	it("lets a scripted concierge hand the conversation to a real sector", { timeout: 120_000 }, async () => {
		bed = await mixedStore()
			.withModel(storeModel())
			.withScript(ConciergeAgent, (script) =>
				script.mockToolCall("transfer_to_agent", { agentName: "sales" }).mockText("Passei para as vendas."),
			)
			.withModelFor("sales", storeModel())
			.withScript(WarrantyAgent, (script) => script.mockText("nada a garantir agora"))
			.withScript(BillingAgent, (script) => script.mockText("nada a cobrar agora"))
			.boot();

		const run = await bed.agent(ConciergeAgent).ask("Quanto custa uma cópia de Stardew Valley?");

		expect(run).toHaveTransferredTo("sales");
		expect(run).toHaveRunTool("quote_game");
		expect(run.text).toContain("24");
	});

	/** A scripted sector costs nothing, so the paid part of the run is the decision alone. */
	it("spends one provider call when only the deciding agent is real", { timeout: 120_000 }, async () => {
		const recording = new RecordingModel(storeModel());
		bed = await mixedStore()
			.withModel(recording)
			.withModelFor("concierge", recording)
			.withScript(WarrantyAgent, (script) => script.mockText("Vamos cuidar disso."))
			.withScript(SalesAgent, (script) => script.mockText("nada a vender agora"))
			.withScript(BillingAgent, (script) => script.mockText("nada a cobrar agora"))
			.boot();

		await bed.agent(ConciergeAgent).ask("Meu controle chegou quebrado.");

		expect(recording.callCount).toBeLessThanOrEqual(2);
		expect(bed.script(SalesAgent)?.requests).toHaveLength(0);
	});
});
