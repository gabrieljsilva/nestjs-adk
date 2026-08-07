import "reflect-metadata";
import "@nestjs-adk/testing/matchers";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { ModelResolver, SessionStorage, SqliteConnection, SqliteSessionStorage } from "@nestjs-adk/core";
import { AdkTestBedBuilder, RoutingModelResolver, RunTranscript } from "@nestjs-adk/testing";
import { Test } from "@nestjs/testing";
import { describe, expect, it } from "vitest";
import { OrderRepository } from "../../aftersales/order.repository";
import { AppModule } from "../../app.module";
import { ApproveToolCallUseCase } from "../../chat/approve-tool-call.use-case";
import { InspectSessionUseCase } from "../../chat/inspect-session.use-case";
import { SendMessageUseCase } from "../../chat/send-message.use-case";
import { StoreDatabase } from "../../shared/store-database";
import { geminiEmbedder, geminiFlashLite, openAILuna } from "../../testing/models";
import { BillingAgent } from "../billing/billing.agent";
import { ConciergeAgent } from "../concierge/concierge.agent";
import { WarrantyAgent } from "../warranty/warranty.agent";

/**
 * The front desk, where every conversation starts and most of them leave.
 *
 * The concierge holds no tools on purpose: what it decides is which sector owns the
 * question, and a real model is the only thing that can be asked to decide it. What lands
 * in the session afterwards is the assertion.
 */
describe("AI: the concierge, and where a conversation ends up", () => {
	it("hands a broken product to the sector that owns it", { timeout: 120_000 }, async () => {
		const connection = new SqliteConnection();
		await using bed = await AdkTestBedBuilder.from(Test.createTestingModule({ imports: [AppModule] }))
			.overriding(StoreDatabase, new StoreDatabase(connection))
			.overriding(SessionStorage, new SqliteSessionStorage(connection))
			.withModel(openAILuna)
			.withConsumers(new RunTranscript())
			.boot();

		const result = await bed
			.get(SendMessageUseCase)
			.execute("My controller arrived broken and the analog stick is loose.");
		const session = await bed.get(InspectSessionUseCase).execute(result.sessionId.value);

		expect(bed.events).toHaveTransferredTo("warranty");
		expect(session.activeAgent.value).toBe("warranty");
	});

	it("hands a question about buying to sales instead", { timeout: 120_000 }, async () => {
		const connection = new SqliteConnection();
		await using bed = await AdkTestBedBuilder.from(Test.createTestingModule({ imports: [AppModule] }))
			.overriding(StoreDatabase, new StoreDatabase(connection))
			.overriding(SessionStorage, new SqliteSessionStorage(connection))
			.withModel(openAILuna)
			.withConsumers(new RunTranscript())
			.boot();

		const result = await bed.get(SendMessageUseCase).execute("I would like to buy a racing game for PS5.");
		const session = await bed.get(InspectSessionUseCase).execute(result.sessionId.value);

		expect(session.activeAgent.value).toBe("sales");
	});

	/**
	 * A refund is money, and this store still calls it a warranty matter.
	 *
	 * The concierge declares two edges, `sales` and `warranty`, so where a refund goes is a
	 * decision the prompt makes and not one the topic makes. That is the thing worth paying
	 * a provider to check: an agent cannot transfer along an edge nobody declared.
	 */
	it("hands a refund to the sector the store declared for it", { timeout: 120_000 }, async () => {
		const connection = new SqliteConnection();
		await using bed = await AdkTestBedBuilder.from(Test.createTestingModule({ imports: [AppModule] }))
			.overriding(StoreDatabase, new StoreDatabase(connection))
			.overriding(SessionStorage, new SqliteSessionStorage(connection))
			.withModel(openAILuna)
			.withConsumers(new RunTranscript())
			.boot();

		const result = await bed.get(SendMessageUseCase).execute("I want a refund for an order that arrived defective.");

		expect(bed.events).toHaveTransferredTo("warranty");
	});

	it("answers a greeting itself, without handing it to anybody", { timeout: 120_000 }, async () => {
		const connection = new SqliteConnection();
		await using bed = await AdkTestBedBuilder.from(Test.createTestingModule({ imports: [AppModule] }))
			.overriding(StoreDatabase, new StoreDatabase(connection))
			.overriding(SessionStorage, new SqliteSessionStorage(connection))
			.withModel(openAILuna)
			.withConsumers(new RunTranscript())
			.boot();

		const run = await bed.agent(ConciergeAgent).ask("Hi, good morning!");

		expect(run.text.length).toBeGreaterThan(0);
		expect(run.transfers).toEqual([]);
	});

	/**
	 * The conversation outlives the process that started it.
	 *
	 * Nothing of the first application survives here: the second one is booted over the
	 * same SQLite file and nothing else, so an answer that knows the name proves the
	 * journal was read back rather than remembered.
	 */
	it("continues a conversation another process started", { timeout: 120_000 }, async () => {
		const directory = mkdtempSync(join(tmpdir(), "playground-ai-"));
		const file = join(directory, "store.db");
		try {
			let sessionId: string;
			{
				const connection = new SqliteConnection(file);
				await using first = await AdkTestBedBuilder.from(Test.createTestingModule({ imports: [AppModule] }))
					.overriding(StoreDatabase, new StoreDatabase(connection))
					.overriding(SessionStorage, new SqliteSessionStorage(connection))
					.withModel(openAILuna)
					.withConsumers(new RunTranscript())
					.boot();
				sessionId = (await first.get(SendMessageUseCase).execute("My name is Gabriel. Remember that.")).sessionId.value;
			}

			const connection = new SqliteConnection(file);
			await using restarted = await AdkTestBedBuilder.from(Test.createTestingModule({ imports: [AppModule] }))
				.overriding(StoreDatabase, new StoreDatabase(connection))
				.overriding(SessionStorage, new SqliteSessionStorage(connection))
				.withModel(openAILuna)
				.withConsumers(new RunTranscript())
				.boot();
			const answer = await restarted.get(SendMessageUseCase).execute("What is my name?", sessionId);

			expect(answer.sessionId.value).toBe(sessionId);
			expect(answer.text).toContain("Gabriel");
		} finally {
			rmSync(directory, { recursive: true, force: true });
		}
	});
});

/**
 * The same store, answered by two providers.
 *
 * A model is replaceable only if replacing it does not change what the customer is told.
 * The wording moves, so the comparison is the meaning: both answers are embedded and the
 * cosine between them is the assertion. It requires both provider keys.
 */
describe("AI: two models behind the same store", () => {
	it("says close enough to the same thing on OpenAI and on Gemini", { timeout: 180_000 }, async () => {
		const question = "Which gaming platforms do you sell games for? Answer in one sentence.";
		let fromOpenAi: string;
		{
			const connection = new SqliteConnection();
			await using openAiBed = await AdkTestBedBuilder.from(Test.createTestingModule({ imports: [AppModule] }))
				.overriding(StoreDatabase, new StoreDatabase(connection))
				.overriding(SessionStorage, new SqliteSessionStorage(connection))
				.withModel(openAILuna)
				.withConsumers(new RunTranscript())
				.boot();
			fromOpenAi = (await openAiBed.get(SendMessageUseCase).execute(question)).text;
		}

		const connection = new SqliteConnection();
		await using geminiBed = await AdkTestBedBuilder.from(Test.createTestingModule({ imports: [AppModule] }))
			.overriding(StoreDatabase, new StoreDatabase(connection))
			.overriding(SessionStorage, new SqliteSessionStorage(connection))
			.withConsumers(new RunTranscript())
			.withModel(geminiFlashLite)
			.withModelFor("concierge", geminiFlashLite)
			.withModelFor("sales", geminiFlashLite)
			.withModelFor("warranty", geminiFlashLite)
			.withModelFor("billing", geminiFlashLite)
			.boot();
		const fromGemini = (await geminiBed.get(SendMessageUseCase).execute(question)).text;

		expect(fromOpenAi.length).toBeGreaterThan(0);
		expect(fromGemini.length).toBeGreaterThan(0);
		expect(await geminiEmbedder.embed(fromOpenAi)).toBeSimilarTo(await geminiEmbedder.embed(fromGemini), 0.6);
	});

	/**
	 * The hand off that carries the conversation across a provider boundary.
	 *
	 * A transfer moves the session itself, so the agent that receives it replays a journal
	 * holding a `transfer_to_agent` call another provider wrote. Gemini 3 refuses an unsigned
	 * call in the turn it is answering, and this was a 400 that killed the run until the
	 * adapter started sending the placeholder Google documents for it. Only a real pair of
	 * providers can prove that, which is what this is for. See the cross provider guideline.
	 */
	it("carries a transfer from one provider into an agent on another", { timeout: 180_000 }, async () => {
		const connection = new SqliteConnection();
		await using bed = await AdkTestBedBuilder.from(Test.createTestingModule({ imports: [AppModule] }))
			.overriding(StoreDatabase, new StoreDatabase(connection))
			.overriding(SessionStorage, new SqliteSessionStorage(connection))
			.withConsumers(new RunTranscript())
			.withModel(openAILuna)
			.withModelFor("concierge", openAILuna)
			.withModelFor("sales", openAILuna)
			.withModelFor("billing", openAILuna)
			.withModelFor("warranty", geminiFlashLite)
			.boot();

		const run = await bed.agent(ConciergeAgent).ask("My controller arrived broken and the analog stick is loose.");

		expect(run).toHaveTransferredTo("warranty");
		expect(run).toHaveStatus("completed");
		expect(run.text.length).toBeGreaterThan(0);
	});

	/**
	 * A run that stopped in front of a human, resumed on a different provider.
	 *
	 * This is the third way inherited context crosses a provider boundary, and the only one
	 * left without a real pair of providers behind it. The journal the resumed run replays
	 * holds an `issue_refund` call that OpenAI wrote and Gemini never signed, which is the
	 * shape that used to be a 400. A resolver deciding differently between the question and
	 * the answer is not contrived: cost and load are both reasons to.
	 */
	it("resumes an approval on a provider that did not ask for it", { timeout: 180_000 }, async () => {
		const connection = new SqliteConnection();
		await using bed = await AdkTestBedBuilder.from(Test.createTestingModule({ imports: [AppModule] }))
			.overriding(StoreDatabase, new StoreDatabase(connection))
			.overriding(SessionStorage, new SqliteSessionStorage(connection))
			.withConsumers(new RunTranscript())
			.withModel(openAILuna)
			.withModelFor("concierge", openAILuna)
			.withModelFor("sales", openAILuna)
			.withModelFor("warranty", openAILuna)
			.withModelFor("billing", openAILuna)
			.boot();
		const run = await bed.agent(BillingAgent).ask("Refund the 349 reais from order A-1042.");
		expect(run).toAwaitApproval("issue_refund");

		(bed.get(ModelResolver) as RoutingModelResolver).route("billing", geminiFlashLite);
		const resumed = await bed
			.get(ApproveToolCallUseCase)
			.execute(run.sessionId.value, run.pendingCall("issue_refund").callId.value, "manager@nebula.test");

		expect(resumed.status.name).toBe("completed");
		expect(bed.events.ran("issue_refund")).toBe(1);
		expect(bed.get(OrderRepository).findById("A-1042")?.refundedCents).toBe(34_900);
	});

	/**
	 * One provider asking, another answering, without moving the conversation.
	 *
	 * Delegation crosses cleanly for a different reason: the specialist is given a task and
	 * starts from nothing, so nothing another provider wrote reaches it at all.
	 */
	it("asks a sector on another provider one question, and reads the answer back", { timeout: 180_000 }, async () => {
		const connection = new SqliteConnection();
		await using bed = await AdkTestBedBuilder.from(Test.createTestingModule({ imports: [AppModule] }))
			.overriding(StoreDatabase, new StoreDatabase(connection))
			.overriding(SessionStorage, new SqliteSessionStorage(connection))
			.withConsumers(new RunTranscript())
			.withModel(openAILuna)
			.withModelFor("concierge", openAILuna)
			.withModelFor("sales", openAILuna)
			.withModelFor("warranty", openAILuna)
			.withModelFor("billing", geminiFlashLite)
			.boot();

		const run = await bed.agent(WarrantyAgent).ask("How much can the gold plan receive back?");

		expect(run).toHaveDelegatedTo("billing");
		expect(run.text).toMatch(/1[.,]?437/);
	});
});
