import "reflect-metadata";
import "@nestjs-adk/testing/matchers";
import { SessionStorage, SqliteConnection, SqliteSessionStorage } from "@nestjs-adk/core";
import { type AdkTestBed, AdkTestBedBuilder, RecordingModel, RunTranscript, ToolFake } from "@nestjs-adk/testing";
import { Test } from "@nestjs/testing";
import { describe, expect, it } from "vitest";
import { OrderRepository } from "../aftersales/order.repository";
import { BillingAgent } from "../agents/billing/billing.agent";
import { ConciergeAgent } from "../agents/concierge/concierge.agent";
import { SalesAgent } from "../agents/sales/sales.agent";
import { WarrantyAgent } from "../agents/warranty/warranty.agent";
import { AppModule } from "../app.module";
import { SearchGamesTool } from "../catalog/tools/search-games.tool";
import { StoreDatabase } from "../shared/store-database";
import { openAILuna } from "./models";

/**
 * The testing API itself, against a provider that was not told what to answer.
 *
 * Everything a fake can prove about this API is proved for free in `packages/testing`.
 * What only a provider can answer is whether the same vocabulary holds when nobody wrote
 * the conversation: that a run started by a real model records the tools it reached for
 * with the arguments it chose, that a tool replaced by a double is the one the model
 * calls, and that scripting one agent while another decides for itself works in one run.
 */
describe("AI: the testing API, over a model nobody scripted", () => {
	it("records the tools a real model reached for, with what it chose", { timeout: 120_000 }, async () => {
		const connection = new SqliteConnection();
		await using bed = await AdkTestBedBuilder.from(Test.createTestingModule({ imports: [AppModule] }))
			.overriding(StoreDatabase, new StoreDatabase(connection))
			.overriding(SessionStorage, new SqliteSessionStorage(connection))
			.withModel(openAILuna)
			.withConsumers(new RunTranscript())
			.boot();

		const run = await bed.agent(SalesAgent).ask("How much does one copy of Stardew Valley cost?");

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
			const connection = new SqliteConnection();
			await using bed = await AdkTestBedBuilder.from(Test.createTestingModule({ imports: [AppModule] }))
				.overriding(StoreDatabase, new StoreDatabase(connection))
				.overriding(SessionStorage, new SqliteSessionStorage(connection))
				.withModel(openAILuna)
				.withConsumers(new RunTranscript())
				.replaceTool(SearchGamesTool, search)
				.boot();

			const run = await bed.agent(SalesAgent).ask("Which PS5 games do you have? List the titles.");

			expect(search.callCount).toBeGreaterThan(0);
			expect(run.text).toContain("Cyber Drift");
		},
	);

	it(
		"keeps a copy of the traffic, which is what a recorded replay would be built on",
		{ timeout: 120_000 },
		async () => {
			const recording = new RecordingModel(openAILuna);
			const connection = new SqliteConnection();
			await using bed = await AdkTestBedBuilder.from(Test.createTestingModule({ imports: [AppModule] }))
				.overriding(StoreDatabase, new StoreDatabase(connection))
				.overriding(SessionStorage, new SqliteSessionStorage(connection))
				.withConsumers(new RunTranscript())
				.withModel(recording)
				.withModelFor("concierge", recording)
				.withModelFor("sales", recording)
				.withModelFor("warranty", recording)
				.withModelFor("billing", recording)
				.boot();

			await bed.agent(SalesAgent).ask("Hi, how are you?");

			expect(recording.callCount).toBeGreaterThan(0);
			expect(recording.calls.at(0)?.chunks.length).toBeGreaterThan(0);
			expect(JSON.stringify(recording)).toContain("calls");
		},
	);

	it("holds a real refund in front of a human and resumes it by tool name", { timeout: 120_000 }, async () => {
		const connection = new SqliteConnection();
		await using bed = await AdkTestBedBuilder.from(Test.createTestingModule({ imports: [AppModule] }))
			.overriding(StoreDatabase, new StoreDatabase(connection))
			.overriding(SessionStorage, new SqliteSessionStorage(connection))
			.withModel(openAILuna)
			.withConsumers(new RunTranscript())
			.boot();
		const billing = bed.agent(BillingAgent);
		const run = await billing.ask("Refund the 349 reais from order A-1042.");
		expect(run).toAwaitApproval("issue_refund");

		const resumed = await billing.approve("issue_refund", "manager@nebula.test");

		expect(resumed).toHaveRunTool("issue_refund");
		expect(bed.get(OrderRepository).findById("A-1042")?.isRefunded).toBe(true);
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
describe("AI: a real model deciding, scripts answering", () => {
	it("routes a real concierge to a scripted sector, and the script answers", { timeout: 120_000 }, async () => {
		const connection = new SqliteConnection();
		await using bed = await AdkTestBedBuilder.from(Test.createTestingModule({ imports: [AppModule] }))
			.overriding(StoreDatabase, new StoreDatabase(connection))
			.overriding(SessionStorage, new SqliteSessionStorage(connection))
			.withConsumers(new RunTranscript())
			.withModel(openAILuna)
			.withModelFor("concierge", openAILuna)
			.withScript(WarrantyAgent, (script) => script.mockText("We will replace your controller within seven days."))
			.withScript(SalesAgent, (script) => script.mockText("nothing to sell right now"))
			.withScript(BillingAgent, (script) => script.mockText("nothing to bill right now"))
			.boot();

		const run = await bed.agent(ConciergeAgent).ask("My controller arrived broken and the analog stick is loose.");

		expect(run).toHaveTransferredTo("warranty");
		expect(run.text).toContain("seven days");
		expect(bed.script(WarrantyAgent)?.requests).toHaveLength(1);
	});

	it("lets a real sector delegate to a scripted one, and reads the answer back", { timeout: 120_000 }, async () => {
		const connection = new SqliteConnection();
		await using bed = await AdkTestBedBuilder.from(Test.createTestingModule({ imports: [AppModule] }))
			.overriding(StoreDatabase, new StoreDatabase(connection))
			.overriding(SessionStorage, new SqliteSessionStorage(connection))
			.withConsumers(new RunTranscript())
			.withModel(openAILuna)
			.withModelFor("warranty", openAILuna)
			.withScript(BillingAgent, (script) => script.mockText("The gold plan limit is 1437 reais."))
			.withScript(SalesAgent, (script) => script.mockText("nothing to sell right now"))
			.withScript(ConciergeAgent, (script) => script.mockText("nothing to route right now"))
			.boot();

		const run = await bed.agent(WarrantyAgent).ask("How much can the gold plan receive back?");

		expect(run).toHaveDelegatedTo("billing");
		expect(run.text).toMatch(/1[.,]?437/);
		expect(bed.script(BillingAgent)?.requests).toHaveLength(1);
	});

	/** The inverse: the decision is scripted, and the sector that answers is the real one. */
	it("lets a scripted concierge hand the conversation to a real sector", { timeout: 120_000 }, async () => {
		const connection = new SqliteConnection();
		await using bed = await AdkTestBedBuilder.from(Test.createTestingModule({ imports: [AppModule] }))
			.overriding(StoreDatabase, new StoreDatabase(connection))
			.overriding(SessionStorage, new SqliteSessionStorage(connection))
			.withConsumers(new RunTranscript())
			.withModel(openAILuna)
			.withScript(ConciergeAgent, (script) =>
				script.mockToolCall("transfer_to_agent", { agentName: "sales" }).mockText("I transferred you to sales."),
			)
			.withModelFor("sales", openAILuna)
			.withScript(WarrantyAgent, (script) => script.mockText("no warranty request right now"))
			.withScript(BillingAgent, (script) => script.mockText("nothing to bill right now"))
			.boot();

		const run = await bed.agent(ConciergeAgent).ask("How much does one copy of Stardew Valley cost?");

		expect(run).toHaveTransferredTo("sales");
		expect(run).toHaveRunTool("quote_game");
		expect(run.text).toContain("24");
	});

	/** A scripted sector costs nothing, so the paid part of the run is the decision alone. */
	it("spends one provider call when only the deciding agent is real", { timeout: 120_000 }, async () => {
		const recording = new RecordingModel(openAILuna);
		const connection = new SqliteConnection();
		await using bed = await AdkTestBedBuilder.from(Test.createTestingModule({ imports: [AppModule] }))
			.overriding(StoreDatabase, new StoreDatabase(connection))
			.overriding(SessionStorage, new SqliteSessionStorage(connection))
			.withConsumers(new RunTranscript())
			.withModel(recording)
			.withModelFor("concierge", recording)
			.withScript(WarrantyAgent, (script) => script.mockText("We will take care of it."))
			.withScript(SalesAgent, (script) => script.mockText("nothing to sell right now"))
			.withScript(BillingAgent, (script) => script.mockText("nothing to bill right now"))
			.boot();

		await bed.agent(ConciergeAgent).ask("My controller arrived broken.");

		expect(recording.callCount).toBeLessThanOrEqual(2);
		expect(bed.script(SalesAgent)?.requests).toHaveLength(0);
	});
});
