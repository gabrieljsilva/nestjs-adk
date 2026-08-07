import "reflect-metadata";
import "@nestjs-adk/testing/matchers";
import { SessionStorage, SqliteConnection, SqliteSessionStorage } from "@nestjs-adk/core";
import { AdkTestBedBuilder, RunTranscript } from "@nestjs-adk/testing";
import { Test } from "@nestjs/testing";
import { describe, expect, it } from "vitest";
import { OrderRepository } from "../../aftersales/order.repository";
import { AppModule } from "../../app.module";
import { ApproveToolCallUseCase } from "../../chat/approve-tool-call.use-case";
import { RejectToolCallUseCase } from "../../chat/reject-tool-call.use-case";
import { StoreDatabase } from "../../shared/store-database";
import { judge, openAILuna } from "../../testing/models";
import { BillingAgent } from "../billing/billing.agent";

/**
 * Money leaving, with a real model deciding to make it leave.
 *
 * The approval policy holds anything destructive, and `issue_refund` is the only tool the
 * store declares that way. What a fake cannot prove is that a provider asked to refund an
 * order actually calls it, which is the moment the policy has to be there.
 */
describe("AI: billing, and the human in front of the money", () => {
	it("stops in front of the human before any money leaves", { timeout: 120_000 }, async () => {
		const connection = new SqliteConnection();
		await using bed = await AdkTestBedBuilder.from(Test.createTestingModule({ imports: [AppModule] }))
			.overriding(StoreDatabase, new StoreDatabase(connection))
			.overriding(SessionStorage, new SqliteSessionStorage(connection))
			.withModel(openAILuna)
			.withConsumers(new RunTranscript())
			.boot();
		const run = await bed.agent(BillingAgent).ask("Refund the 349 reais from order A-1042.");

		expect(run).toAwaitApproval("issue_refund");
		expect(run).not.toHaveRunTool("issue_refund");
		expect(bed.get(OrderRepository).findById("A-1042")?.isRefunded).toBe(false);
	});

	it("lets the money leave once a human said yes, and records it", { timeout: 120_000 }, async () => {
		const connection = new SqliteConnection();
		await using bed = await AdkTestBedBuilder.from(Test.createTestingModule({ imports: [AppModule] }))
			.overriding(StoreDatabase, new StoreDatabase(connection))
			.overriding(SessionStorage, new SqliteSessionStorage(connection))
			.withModel(openAILuna)
			.withConsumers(new RunTranscript())
			.boot();
		const run = await bed.agent(BillingAgent).ask("Refund the 349 reais from order A-1042.");

		const resumed = await bed
			.get(ApproveToolCallUseCase)
			.execute(run.sessionId.value, run.pendingCall("issue_refund").callId.value, "manager@nebula.test");

		expect(resumed.status.name).toBe("completed");
		expect(bed.events.ran("issue_refund")).toBe(1);
		expect(bed.get(OrderRepository).findById("A-1042")?.refundedCents).toBe(34_900);
	});

	it("keeps the money when a human said no, and the conversation carries on", { timeout: 120_000 }, async () => {
		const connection = new SqliteConnection();
		await using bed = await AdkTestBedBuilder.from(Test.createTestingModule({ imports: [AppModule] }))
			.overriding(StoreDatabase, new StoreDatabase(connection))
			.overriding(SessionStorage, new SqliteSessionStorage(connection))
			.withModel(openAILuna)
			.withConsumers(new RunTranscript())
			.boot();
		const run = await bed.agent(BillingAgent).ask("Refund the 349 reais from order A-1042.");

		const resumed = await bed
			.get(RejectToolCallUseCase)
			.execute(
				run.sessionId.value,
				run.pendingCall("issue_refund").callId.value,
				"outside the seven-day window",
				"manager@nebula.test",
			);

		expect(resumed.status.name).toBe("completed");
		expect(bed.events.denied("issue_refund")).toBe(1);
		expect(bed.get(OrderRepository).findById("A-1042")?.isRefunded).toBe(false);
		expect(bed.get(OrderRepository).findById("A-1042")?.refundedCents).toBe(0);
		expect(resumed.text.length).toBeGreaterThan(0);
	});

	it("reads the order through its own tool before talking about it", { timeout: 120_000 }, async () => {
		const connection = new SqliteConnection();
		await using bed = await AdkTestBedBuilder.from(Test.createTestingModule({ imports: [AppModule] }))
			.overriding(StoreDatabase, new StoreDatabase(connection))
			.overriding(SessionStorage, new SqliteSessionStorage(connection))
			.withModel(openAILuna)
			.withConsumers(new RunTranscript())
			.boot();

		const run = await bed.agent(BillingAgent).ask("What is the amount and status of order A-1042?");

		expect(run).toHaveRunTool("find_order");
		expect(run.text).toContain("349");
	});

	/** The arguments are the assertion: a refund of the wrong amount is worse than no refund. */
	it("asks to refund the amount the order actually carries", { timeout: 120_000 }, async () => {
		const connection = new SqliteConnection();
		await using bed = await AdkTestBedBuilder.from(Test.createTestingModule({ imports: [AppModule] }))
			.overriding(StoreDatabase, new StoreDatabase(connection))
			.overriding(SessionStorage, new SqliteSessionStorage(connection))
			.withModel(openAILuna)
			.withConsumers(new RunTranscript())
			.boot();
		const run = await bed.agent(BillingAgent).ask("Refund the 349 reais from order A-1042.");

		expect(run.callsTo("issue_refund").at(0)?.args).toMatchObject({ orderId: "A-1042" });
	});

	it("says no to an order nobody placed, without calling the refund", { timeout: 120_000 }, async () => {
		const connection = new SqliteConnection();
		await using bed = await AdkTestBedBuilder.from(Test.createTestingModule({ imports: [AppModule] }))
			.overriding(StoreDatabase, new StoreDatabase(connection))
			.overriding(SessionStorage, new SqliteSessionStorage(connection))
			.withModel(openAILuna)
			.withConsumers(new RunTranscript())
			.boot();

		const run = await bed.agent(BillingAgent).ask("What is the status of order A-9999?");

		expect(run).not.toHaveRunTool("issue_refund");
		expect(run.status.name).toBe("completed");
	});

	it("answers the ceiling of a plan through the tool that knows it", { timeout: 120_000 }, async () => {
		const connection = new SqliteConnection();
		await using bed = await AdkTestBedBuilder.from(Test.createTestingModule({ imports: [AppModule] }))
			.overriding(StoreDatabase, new StoreDatabase(connection))
			.overriding(SessionStorage, new SqliteSessionStorage(connection))
			.withModel(openAILuna)
			.withConsumers(new RunTranscript())
			.boot();

		const run = await bed.agent(BillingAgent).ask("Use the refund_limit tool to report the gold plan refund limit.");

		expect(run).toHaveRunTool("refund_limit");
		// The thousands separator is the model's choice, and it makes both spellings correct.
		expect(run.text).toMatch(/1[.,]?437/);
	});

	/** The wording moves every run, so the judge grades what the answer had to say. */
	it("explains that a refund needs a human, judged rather than matched", { timeout: 120_000 }, async () => {
		const connection = new SqliteConnection();
		await using bed = await AdkTestBedBuilder.from(Test.createTestingModule({ imports: [AppModule] }))
			.overriding(StoreDatabase, new StoreDatabase(connection))
			.overriding(SessionStorage, new SqliteSessionStorage(connection))
			.withModel(openAILuna)
			.withConsumers(new RunTranscript())
			.boot();
		const run = await bed.agent(BillingAgent).ask("Refund the 349 reais from order A-1042.");

		const resumed = await bed
			.get(RejectToolCallUseCase)
			.execute(run.sessionId.value, run.pendingCall("issue_refund").callId.value, "outside the window", "manager");

		await expect(resumed.text).toSatisfyRubric(judge, "says the refund was not made, and gives a reason");
	});
});
