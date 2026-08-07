import "reflect-metadata";
import "@nestjs-adk/testing/matchers";
import {
	AgentMaxIterationsError,
	AgentRegistry,
	type ContextBlock,
	ContextSummarizer,
	RunLimits,
	SessionStorage,
	SqliteConnection,
	SqliteSessionStorage,
	TokenThresholdCompactionPolicy,
	UnsupportedCapabilityError,
} from "@nestjs-adk/core";
import { AdkTestBedBuilder } from "@nestjs-adk/testing";
import { Test } from "@nestjs/testing";
import { describe, expect, it } from "vitest";
import { OrderRepository } from "./aftersales/order.repository";
import { TicketRepository } from "./aftersales/ticket.repository";
import { BillingAgent } from "./agents/billing/billing.agent";
import { ConciergeAgent } from "./agents/concierge/concierge.agent";
import { SalesAgent } from "./agents/sales/sales.agent";
import { WarrantyAgent } from "./agents/warranty/warranty.agent";
import { AppModule } from "./app.module";
import { Attachment } from "./chat/attachment";
import { InspectSessionUseCase } from "./chat/inspect-session.use-case";
import { SendMessageUseCase } from "./chat/send-message.use-case";
import { StoreDatabase } from "./shared/store-database";

/** Says what it replaced, so a test can find the summary among the messages without a provider. */
class NamingSummarizer extends ContextSummarizer {
	public async summarize(blocks: readonly ContextBlock[]): Promise<string> {
		return `NOTES FROM ${blocks.length} TRECHOS`;
	}
}

describe("the store, end to end", () => {
	it("binds every sector to the runtime, by class and by name", async () => {
		const connection = new SqliteConnection();
		await using bed = await AdkTestBedBuilder.from(Test.createTestingModule({ imports: [AppModule] }))
			.overriding(StoreDatabase, new StoreDatabase(connection))
			.overriding(SessionStorage, new SqliteSessionStorage(connection))
			.withScript(ConciergeAgent, (script) => script.mockText("concierge"))
			.withScript(SalesAgent, (script) => script.mockText("sales"))
			.withScript(WarrantyAgent, (script) => script.mockText("warranty"))
			.withScript(BillingAgent, (script) => script.mockText("billing"))
			.boot();
		const registry = bed.get(AgentRegistry);

		expect(bed.get(ConciergeAgent).agentName.value).toBe("concierge");
		expect(bed.get(SalesAgent).agentName.value).toBe("sales");
		expect(registry.get("warranty").name.value).toBe("warranty");
		expect(registry.get("billing").name.value).toBe("billing");
	});

	it("runs a tool through the use case and SQLite", async () => {
		const connection = new SqliteConnection();
		await using bed = await AdkTestBedBuilder.from(Test.createTestingModule({ imports: [AppModule] }))
			.overriding(StoreDatabase, new StoreDatabase(connection))
			.overriding(SessionStorage, new SqliteSessionStorage(connection))
			.withScript(ConciergeAgent, (script) => script.mockText("not called"))
			.withScript(SalesAgent, (script) =>
				script.mockToolCall("search_games", { term: "ps5" }).mockText("We have Elden Ring Nightreign for PS5."),
			)
			.withScript(WarrantyAgent, (script) => script.mockText("not called"))
			.withScript(BillingAgent, (script) => script.mockText("not called"))
			.boot();

		const run = await bed.agent(SalesAgent).ask("which PS5 games do you have?");

		expect(run).toHaveRunTool("search_games", { term: "ps5" });
		expect(run.text).toBe("We have Elden Ring Nightreign for PS5.");
	});

	it("shows the model the number the catalog answered, not one it made up", async () => {
		const connection = new SqliteConnection();
		await using bed = await AdkTestBedBuilder.from(Test.createTestingModule({ imports: [AppModule] }))
			.overriding(StoreDatabase, new StoreDatabase(connection))
			.overriding(SessionStorage, new SqliteSessionStorage(connection))
			.withScript(ConciergeAgent, (script) => script.mockText("not called"))
			.withScript(SalesAgent, (script) =>
				script
					.mockToolCall("quote_game", { slug: "elden-ring-nightreign", quantity: 3 })
					.mockText("Three copies cost 755.73 reais."),
			)
			.withScript(WarrantyAgent, (script) => script.mockText("not called"))
			.withScript(BillingAgent, (script) => script.mockText("not called"))
			.boot();

		const run = await bed.agent(SalesAgent).ask("how much do three copies of Elden Ring Nightreign cost?");

		expect(JSON.stringify(run.callsTo("quote_game").at(0)?.output)).toContain("755.73");
		expect(JSON.stringify(bed.script(SalesAgent)?.requests.at(-1))).toContain("755.73");
	});

	it("holds the refund in front of a human before any money leaves", async () => {
		const connection = new SqliteConnection();
		await using bed = await AdkTestBedBuilder.from(Test.createTestingModule({ imports: [AppModule] }))
			.overriding(StoreDatabase, new StoreDatabase(connection))
			.overriding(SessionStorage, new SqliteSessionStorage(connection))
			.withScript(ConciergeAgent, (script) => script.mockText("not called"))
			.withScript(SalesAgent, (script) => script.mockText("not called"))
			.withScript(WarrantyAgent, (script) => script.mockText("not called"))
			.withScript(BillingAgent, (script) => script.mockToolCall("issue_refund", { orderId: "A-1042", amountBrl: 349 }))
			.boot();

		const run = await bed.agent(BillingAgent).ask("refund order A-1042");

		expect(run).toAwaitApproval("issue_refund");
		expect(run).not.toHaveRunTool("issue_refund");
		expect(bed.get(OrderRepository).findById("A-1042")?.isRefunded).toBe(false);
	});

	it("lets the money leave once a human said so, and records it", async () => {
		const connection = new SqliteConnection();
		await using bed = await AdkTestBedBuilder.from(Test.createTestingModule({ imports: [AppModule] }))
			.overriding(StoreDatabase, new StoreDatabase(connection))
			.overriding(SessionStorage, new SqliteSessionStorage(connection))
			.withScript(ConciergeAgent, (script) => script.mockText("not called"))
			.withScript(SalesAgent, (script) => script.mockText("not called"))
			.withScript(WarrantyAgent, (script) => script.mockText("not called"))
			.withScript(BillingAgent, (script) =>
				script
					.mockToolCall("issue_refund", { orderId: "A-1042", amountBrl: 349 })
					.mockText("The 349 reais refund was completed."),
			)
			.boot();
		const billing = bed.agent(BillingAgent);
		await billing.ask("refund order A-1042");

		const resumed = await billing.approve("issue_refund", "manager@nebula.test");

		expect(resumed).toHaveStatus("completed");
		expect(resumed).toHaveRunTool("issue_refund");
		expect(bed.get(OrderRepository).findById("A-1042")?.refundedCents).toBe(34_900);
	});

	it("keeps the money when a human refused, and the conversation carries on", async () => {
		const connection = new SqliteConnection();
		await using bed = await AdkTestBedBuilder.from(Test.createTestingModule({ imports: [AppModule] }))
			.overriding(StoreDatabase, new StoreDatabase(connection))
			.overriding(SessionStorage, new SqliteSessionStorage(connection))
			.withScript(ConciergeAgent, (script) => script.mockText("not called"))
			.withScript(SalesAgent, (script) => script.mockText("not called"))
			.withScript(WarrantyAgent, (script) => script.mockText("not called"))
			.withScript(BillingAgent, (script) =>
				script
					.mockToolCall("issue_refund", { orderId: "A-1042", amountBrl: 349 })
					.mockText("Understood, I will not issue the refund."),
			)
			.boot();
		const billing = bed.agent(BillingAgent);
		await billing.ask("refund order A-1042");

		const resumed = await billing.reject("outside policy", "issue_refund");

		expect(resumed).toHaveStatus("completed");
		expect(resumed).toHaveDeniedTool("issue_refund");
		expect(bed.get(OrderRepository).findById("A-1042")?.isRefunded).toBe(false);
		expect(JSON.stringify(bed.script(BillingAgent)?.requests.at(-1))).toContain("outside policy");
	});

	it("hands the conversation to the sector that owns it", async () => {
		const connection = new SqliteConnection();
		await using bed = await AdkTestBedBuilder.from(Test.createTestingModule({ imports: [AppModule] }))
			.overriding(StoreDatabase, new StoreDatabase(connection))
			.overriding(SessionStorage, new SqliteSessionStorage(connection))
			.withScript(ConciergeAgent, (script) =>
				script.mockToolCall("transfer_to_agent", { agentName: "warranty" }).mockText("I transferred you to warranty."),
			)
			.withScript(WarrantyAgent, (script) => script.mockText("We will take care of your controller."))
			.withScript(SalesAgent, (script) => script.mockText("not called"))
			.withScript(BillingAgent, (script) => script.mockText("not called"))
			.boot();

		const result = await bed.get(SendMessageUseCase).execute("my controller arrived broken");
		const session = await bed.get(InspectSessionUseCase).execute(result.sessionId.value);

		expect(session.activeAgent.value).toBe("warranty");
		expect(bed.events).toHaveTransferredTo("warranty");
	});

	it("transfers, works in the new sector, and transfers back to the previous sector", async () => {
		const connection = new SqliteConnection();
		await using bed = await AdkTestBedBuilder.from(Test.createTestingModule({ imports: [AppModule] }))
			.overriding(StoreDatabase, new StoreDatabase(connection))
			.overriding(SessionStorage, new SqliteSessionStorage(connection))
			.withScript(ConciergeAgent, (script) => script.mockText("not called"))
			.withScript(SalesAgent, (script) => script.mockText("not called"))
			.withScript(WarrantyAgent, (script) =>
				script
					.mockToolCall("transfer_to_agent", { agentName: "billing" })
					.mockText("We are back with warranty after checking the order."),
			)
			.withScript(BillingAgent, (script) =>
				script
					.mockToolCall("find_order", { orderId: "A-1042" })
					.mockToolCall("transfer_to_agent", { agentName: "warranty" }),
			)
			.boot();

		const run = await bed.agent(WarrantyAgent).ask("Check my order with billing and then continue my warranty support.");
		const session = await bed.get(InspectSessionUseCase).execute(run.sessionId.value);

		expect(run.events.transfers).toEqual(["billing", "warranty"]);
		expect(run).toHaveRunTool("find_order", { orderId: "A-1042" });
		expect(session.activeAgent.value).toBe("warranty");
		expect(run.text).toBe("We are back with warranty after checking the order.");
	});

	it("asks another sector one question without giving the conversation away", async () => {
		const connection = new SqliteConnection();
		await using bed = await AdkTestBedBuilder.from(Test.createTestingModule({ imports: [AppModule] }))
			.overriding(StoreDatabase, new StoreDatabase(connection))
			.overriding(SessionStorage, new SqliteSessionStorage(connection))
			.withScript(ConciergeAgent, (script) => script.mockText("not called"))
			.withScript(SalesAgent, (script) => script.mockText("not called"))
			.withScript(WarrantyAgent, (script) =>
				script
					.mockToolCall("delegate_to_agent", { agentName: "billing", task: "what is the gold plan refund limit?" })
					.mockText("The gold plan refunds up to 1437 reais."),
			)
			.withScript(BillingAgent, (script) => script.mockText("The gold plan limit is 1437 reais."))
			.boot();

		const run = await bed.agent(WarrantyAgent).ask("how much can the gold plan receive back?");
		const session = await bed.get(InspectSessionUseCase).execute(run.sessionId.value);

		expect(run).toHaveDelegatedTo("billing");
		expect(run.events.types).toContain("delegation.completed");
		expect(session.activeAgent.value).toBe("warranty");
	});

	it("answers a tool that cannot do what it was asked, instead of failing the run", async () => {
		const connection = new SqliteConnection();
		await using bed = await AdkTestBedBuilder.from(Test.createTestingModule({ imports: [AppModule] }))
			.overriding(StoreDatabase, new StoreDatabase(connection))
			.overriding(SessionStorage, new SqliteSessionStorage(connection))
			.withScript(ConciergeAgent, (script) => script.mockText("not called"))
			.withScript(SalesAgent, (script) => script.mockText("not called"))
			.withScript(WarrantyAgent, (script) =>
				script.mockToolCall("open_ticket", { orderId: "A-9", reason: "broken" }).mockText("I could not find that order."),
			)
			.withScript(BillingAgent, (script) => script.mockText("not called"))
			.boot();

		const run = await bed.agent(WarrantyAgent).ask("open a ticket for order A-9");

		expect(run).toHaveStatus("completed");
		expect(run.events.ran("open_ticket")).toBe(1);
		expect(bed.get(TicketRepository).findByOrder("A-9")).toEqual([]);
	});

	it("opens the ticket pointing at the conversation it came out of", async () => {
		const connection = new SqliteConnection();
		await using bed = await AdkTestBedBuilder.from(Test.createTestingModule({ imports: [AppModule] }))
			.overriding(StoreDatabase, new StoreDatabase(connection))
			.overriding(SessionStorage, new SqliteSessionStorage(connection))
			.withScript(ConciergeAgent, (script) => script.mockText("not called"))
			.withScript(SalesAgent, (script) => script.mockText("not called"))
			.withScript(WarrantyAgent, (script) =>
				script.mockToolCall("open_ticket", { orderId: "A-1042", reason: "broken controller" }).mockText("Ticket opened."),
			)
			.withScript(BillingAgent, (script) => script.mockText("not called"))
			.boot();

		const run = await bed.agent(WarrantyAgent).ask("open a ticket for order A-1042");

		expect(bed.get(TicketRepository).findByOrder("A-1042").at(0)?.sessionId).toBe(run.sessionId.value);
	});

	it("stops a conversation that will not stop", async () => {
		const connection = new SqliteConnection();
		await using bed = await AdkTestBedBuilder.from(Test.createTestingModule({ imports: [AppModule] }))
			.overriding(StoreDatabase, new StoreDatabase(connection))
			.overriding(SessionStorage, new SqliteSessionStorage(connection))
			.withScript(ConciergeAgent, (script) => script.mockText("not called"))
			.withScript(SalesAgent, (script) => {
				for (let turn = 0; turn < 5; turn += 1) script.mockToolCall("search_games", { term: "ps5" });
			})
			.withScript(WarrantyAgent, (script) => script.mockText("not called"))
			.withScript(BillingAgent, (script) => script.mockText("not called"))
			.withRuntime({ limits: RunLimits.of(2) })
			.boot();

		await expect(bed.agent(SalesAgent).ask("list everything, again and again")).rejects.toBeInstanceOf(
			AgentMaxIterationsError,
		);
	});

	it("refuses a photo when the model behind the store cannot look at one", async () => {
		const connection = new SqliteConnection();
		await using bed = await AdkTestBedBuilder.from(Test.createTestingModule({ imports: [AppModule] }))
			.overriding(StoreDatabase, new StoreDatabase(connection))
			.overriding(SessionStorage, new SqliteSessionStorage(connection))
			.withScript(ConciergeAgent, (script) => script.mockText("not called"))
			.withScript(SalesAgent, (script) => script.mockText("not called"))
			.withScript(WarrantyAgent, (script) => script.mockText("not called"))
			.withScript(BillingAgent, (script) => script.mockText("not called"))
			.boot();

		await expect(
			bed
				.get(SendMessageUseCase)
				.execute("it arrived like this", undefined, [
					Attachment.of("https://files.example.test/broken-controller.jpg", "image/jpeg"),
				]),
		).rejects.toBeInstanceOf(UnsupportedCapabilityError);
	});

	it("keeps the conversation in the same database as the store", async () => {
		const connection = new SqliteConnection();
		await using bed = await AdkTestBedBuilder.from(Test.createTestingModule({ imports: [AppModule] }))
			.overriding(StoreDatabase, new StoreDatabase(connection))
			.overriding(SessionStorage, new SqliteSessionStorage(connection))
			.withScript(ConciergeAgent, (script) => script.mockText("good morning").mockText("continuing"))
			.withScript(SalesAgent, (script) => script.mockText("not called"))
			.withScript(WarrantyAgent, (script) => script.mockText("not called"))
			.withScript(BillingAgent, (script) => script.mockText("not called"))
			.boot();

		const first = await bed.get(SendMessageUseCase).execute("good morning");
		const second = await bed.get(SendMessageUseCase).execute("continuing", first.sessionId.value);
		const session = await bed.get(InspectSessionUseCase).execute(first.sessionId.value);

		expect(second.sessionId.value).toBe(first.sessionId.value);
		expect(session.revision.value).toBeGreaterThan(1);
		expect(session.id.value).toBe(first.sessionId.value);
	});
});

/**
 * A conversation that outgrew the window, without writing one.
 *
 * The size of a context is whatever the provider said it was, so a script that claims a
 * large prompt is a large prompt as far as the runtime is concerned. That is the whole of
 * the mock: everything else here is the store, its policy and its journal.
 *
 * What has to be true is that the model stops being sent the oldest turns, that a summary
 * arrives in their place, and that nothing was deleted: compaction shortens what is sent,
 * never what was recorded, and a session that lost its history to a token ceiling would be
 * a bug nobody notices until an audit.
 */
describe("the store, on a conversation too long to send", () => {
	it("sends the model a summary in place of the turns it dropped", async () => {
		const detail = "detail ".repeat(60);
		const connection = new SqliteConnection();
		await using bed = await AdkTestBedBuilder.from(Test.createTestingModule({ imports: [AppModule] }))
			.overriding(StoreDatabase, new StoreDatabase(connection))
			.overriding(SessionStorage, new SqliteSessionStorage(connection))
			.withScript(ConciergeAgent, (script) => script.reportsPromptTokens(1_500))
			.withScript(SalesAgent, (script) => script.mockText("not called"))
			.withScript(WarrantyAgent, (script) => script.mockText("not called"))
			.withScript(BillingAgent, (script) => script.mockText("not called"))
			.withRuntime({
				compaction: new TokenThresholdCompactionPolicy(2_000, 1_800, 4),
				summarizer: new NamingSummarizer(),
			})
			.boot();
		const scripted = bed.script(ConciergeAgent);
		if (scripted === undefined) throw new Error("the concierge was booted without a script");

		let sessionId: string | undefined;
		for (let turn = 0; turn < 6; turn += 1) {
			scripted.mockText(`answer ${turn} ${detail}`);
			const result = await bed.get(SendMessageUseCase).execute(`question ${turn} ${detail}`, sessionId);
			sessionId = result.sessionId.value;
		}
		const request = scripted.requests.at(-1);
		const prompt = (request?.messages ?? []).map((message) => message.text).join("\n");

		expect(prompt).toContain("NOTES FROM");
	});

	it("stops sending the oldest turns once the summary stands for them", async () => {
		const detail = "detail ".repeat(60);
		const connection = new SqliteConnection();
		await using bed = await AdkTestBedBuilder.from(Test.createTestingModule({ imports: [AppModule] }))
			.overriding(StoreDatabase, new StoreDatabase(connection))
			.overriding(SessionStorage, new SqliteSessionStorage(connection))
			.withScript(ConciergeAgent, (script) => script.reportsPromptTokens(1_500))
			.withScript(SalesAgent, (script) => script.mockText("not called"))
			.withScript(WarrantyAgent, (script) => script.mockText("not called"))
			.withScript(BillingAgent, (script) => script.mockText("not called"))
			.withRuntime({
				compaction: new TokenThresholdCompactionPolicy(2_000, 1_800, 4),
				summarizer: new NamingSummarizer(),
			})
			.boot();
		const scripted = bed.script(ConciergeAgent);
		if (scripted === undefined) throw new Error("the concierge was booted without a script");

		let sessionId: string | undefined;
		for (let turn = 0; turn < 6; turn += 1) {
			scripted.mockText(`answer ${turn} ${detail}`);
			const result = await bed.get(SendMessageUseCase).execute(`question ${turn} ${detail}`, sessionId);
			sessionId = result.sessionId.value;
		}
		const request = scripted.requests.at(-1);
		const prompt = (request?.messages ?? []).map((message) => message.text).join("\n");

		expect(prompt).not.toContain("question 0");
		expect(prompt).toContain("question 5");
	});

	it("leaves every turn in the session, including the ones it stopped sending", async () => {
		const detail = "detail ".repeat(60);
		const connection = new SqliteConnection();
		await using bed = await AdkTestBedBuilder.from(Test.createTestingModule({ imports: [AppModule] }))
			.overriding(StoreDatabase, new StoreDatabase(connection))
			.overriding(SessionStorage, new SqliteSessionStorage(connection))
			.withScript(ConciergeAgent, (script) => script.reportsPromptTokens(1_500))
			.withScript(SalesAgent, (script) => script.mockText("not called"))
			.withScript(WarrantyAgent, (script) => script.mockText("not called"))
			.withScript(BillingAgent, (script) => script.mockText("not called"))
			.withRuntime({
				compaction: new TokenThresholdCompactionPolicy(2_000, 1_800, 4),
				summarizer: new NamingSummarizer(),
			})
			.boot();
		const scripted = bed.script(ConciergeAgent);
		if (scripted === undefined) throw new Error("the concierge was booted without a script");

		let sessionId: string | undefined;
		for (let turn = 0; turn < 6; turn += 1) {
			scripted.mockText(`answer ${turn} ${detail}`);
			const result = await bed.get(SendMessageUseCase).execute(`question ${turn} ${detail}`, sessionId);
			sessionId = result.sessionId.value;
		}
		const session = await bed.get(InspectSessionUseCase).execute(sessionId ?? "");

		expect(session.revision.value).toBeGreaterThan(4);
	});

	it("compacts nothing while the conversation still fits", async () => {
		const connection = new SqliteConnection();
		await using bed = await AdkTestBedBuilder.from(Test.createTestingModule({ imports: [AppModule] }))
			.overriding(StoreDatabase, new StoreDatabase(connection))
			.overriding(SessionStorage, new SqliteSessionStorage(connection))
			.withScript(ConciergeAgent, (script) => script.reportsPromptTokens(100))
			.withScript(SalesAgent, (script) => script.mockText("not called"))
			.withScript(WarrantyAgent, (script) => script.mockText("not called"))
			.withScript(BillingAgent, (script) => script.mockText("not called"))
			.withRuntime({
				compaction: new TokenThresholdCompactionPolicy(2_000, 1_800, 4),
				summarizer: new NamingSummarizer(),
			})
			.boot();
		const scripted = bed.script(ConciergeAgent);
		if (scripted === undefined) throw new Error("the concierge was booted without a script");
		scripted.mockText("a").mockText("b");

		const first = await bed.get(SendMessageUseCase).execute("question 0");
		await bed.get(SendMessageUseCase).execute("question 1", first.sessionId.value);
		const request = scripted.requests.at(-1);
		const prompt = (request?.messages ?? []).map((message) => message.text).join("\n");

		expect(prompt).toContain("question 0");
	});
});
