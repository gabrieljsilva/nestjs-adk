import "reflect-metadata";
import "@nestjs-adk/testing/matchers";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { AdkTestBed } from "@nestjs-adk/testing";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { InspectSessionUseCase } from "../chat/inspect-session.use-case";
import { SendMessageUseCase } from "../chat/send-message.use-case";
import {
	aiStore,
	breathe,
	closenessOf,
	geminiGate,
	geminiModel,
	mixedStore,
	storeGate,
	storeModel,
} from "./ai-suite.fixture";
import { ConciergeAgent } from "./concierge.agent";
import { WarrantyAgent } from "./warranty.agent";

/** Two models never write the same sentence, so the question has one narrow right answer. */
const SAME_QUESTION = "Vocês vendem jogos de qual plataforma? Responda em uma frase.";
const CLOSE_ENOUGH = 0.6;

let bed: AdkTestBed;

/**
 * The front desk, where every conversation starts and most of them leave.
 *
 * The concierge holds no tools on purpose: what it decides is which sector owns the
 * question, and a real model is the only thing that can be asked to decide it. What lands
 * in the session afterwards is the assertion.
 */
describe.runIf(storeGate.present)("AI: the concierge, and where a conversation ends up", () => {
	beforeEach(breathe);

	afterEach(async () => {
		await bed?.close();
	});

	async function booted(location?: string): Promise<AdkTestBed> {
		bed = await aiStore(location).boot();
		return bed;
	}

	it("hands a broken product to the sector that owns it", { timeout: 120_000 }, async () => {
		await booted();

		const result = await bed.get(SendMessageUseCase).execute("Meu controle chegou quebrado, o analógico está solto.");
		const session = await bed.get(InspectSessionUseCase).execute(result.sessionId.value);

		expect(bed.events).toHaveTransferredTo("warranty");
		expect(session.activeAgent.value).toBe("warranty");
	});

	it("hands a question about buying to sales instead", { timeout: 120_000 }, async () => {
		await booted();

		const result = await bed.get(SendMessageUseCase).execute("Queria comprar um jogo de corrida para PS5.");
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
		await booted();

		const result = await bed.get(SendMessageUseCase).execute("Quero o reembolso de um pedido que chegou com defeito.");
		const session = await bed.get(InspectSessionUseCase).execute(result.sessionId.value);

		expect(session.activeAgent.value).toBe("warranty");
	});

	it("answers a greeting itself, without handing it to anybody", { timeout: 120_000 }, async () => {
		await booted();

		const run = await bed.agent(ConciergeAgent).ask("Oi, bom dia!");

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
			const first = await booted(file);
			const opening = await first.get(SendMessageUseCase).execute("Meu nome é Gabriel. Guarde isso.");
			await first.close();

			const restarted = await booted(file);
			const answer = await restarted.get(SendMessageUseCase).execute("Qual é o meu nome?", opening.sessionId.value);

			expect(answer.sessionId.value).toBe(opening.sessionId.value);
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
 * cosine between them is the assertion. It needs both keys and skips without either.
 */
describe.runIf(storeGate.present && geminiGate.present)("AI: two models behind the same store", () => {
	beforeEach(breathe);

	afterEach(async () => {
		await bed?.close();
	});

	it("says close enough to the same thing on OpenAI and on Gemini", { timeout: 180_000 }, async () => {
		bed = await aiStore().boot();
		const fromOpenAi = (await bed.get(SendMessageUseCase).execute(SAME_QUESTION)).text;
		await bed.close();

		bed = await mixedStore()
			.withModel(geminiModel())
			.withModelFor("concierge", geminiModel())
			.withModelFor("sales", geminiModel())
			.withModelFor("warranty", geminiModel())
			.withModelFor("billing", geminiModel())
			.boot();
		const fromGemini = (await bed.get(SendMessageUseCase).execute(SAME_QUESTION)).text;

		expect(fromOpenAi.length).toBeGreaterThan(0);
		expect(fromGemini.length).toBeGreaterThan(0);
		expect(await closenessOf(fromOpenAi, fromGemini)).toBeGreaterThan(CLOSE_ENOUGH);
	});

	/**
	 * One provider asking, another answering, in one conversation.
	 *
	 * Delegation is the hand off that crosses providers cleanly: the specialist is given a
	 * task and starts from nothing, so nothing another provider wrote reaches it. A transfer
	 * is the opposite and currently cannot cross into Gemini at all, which is measured and
	 * written down in the agent suites guideline rather than asserted here.
	 */
	it("asks a sector on another provider one question, and reads the answer back", { timeout: 180_000 }, async () => {
		bed = await mixedStore()
			.withModel(storeModel())
			.withModelFor("concierge", storeModel())
			.withModelFor("sales", storeModel())
			.withModelFor("warranty", storeModel())
			.withModelFor("billing", geminiModel())
			.boot();

		const run = await bed.agent(WarrantyAgent).ask("Quanto o plano gold pode receber de volta?");

		expect(run).toHaveDelegatedTo("billing");
		expect(run.text).toMatch(/1\.?437/);
	});
});
