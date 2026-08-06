import "reflect-metadata";
import "@nestjs-adk/testing/matchers";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, afterEach, beforeEach, describe, expect, it } from "vitest";
import { InspectSessionUseCase } from "../chat/inspect-session.use-case";
import { SendMessageUseCase } from "../chat/send-message.use-case";
import {
	type AiStore,
	bootAi,
	breathe,
	closenessOf,
	geminiKey,
	geminiModel,
	storeKey,
	storeModel,
} from "./ai-suite.fixture";

const apiKey = storeKey();
const gemini = geminiKey();

/** Two models never write the same sentence, so the question has one narrow right answer. */
const SAME_QUESTION = "Vocês vendem jogos de qual plataforma? Responda em uma frase.";
const CLOSE_ENOUGH = 0.6;

/**
 * The front desk, where every conversation starts and most of them leave.
 *
 * The concierge holds no tools on purpose: what it decides is which sector owns the
 * question, and a real model is the only thing that can be asked to decide it. What lands
 * in the session afterwards is the assertion.
 */
describe.runIf(apiKey)("AI: the concierge, and where a conversation ends up", () => {
	let store: AiStore;

	beforeEach(breathe);

	afterEach(async () => {
		await store?.app.close();
	});

	async function booted(location?: string): Promise<AiStore> {
		if (apiKey === undefined) throw new Error("no api key");
		store = await bootAi(storeModel(apiKey), location === undefined ? {} : { location });
		return store;
	}

	it("hands a broken product to the sector that owns it", { timeout: 120_000 }, async () => {
		const { app, events } = await booted();

		const result = await app.get(SendMessageUseCase).execute("Meu controle chegou quebrado, o analógico está solto.");
		const session = await app.get(InspectSessionUseCase).execute(result.sessionId.value);

		expect(events.types).toContain("agent.transferred");
		expect(session.activeAgent.value).toBe("warranty");
	});

	it("hands a question about buying to sales instead", { timeout: 120_000 }, async () => {
		const { app } = await booted();

		const result = await app.get(SendMessageUseCase).execute("Queria comprar um jogo de corrida para PS5.");
		const session = await app.get(InspectSessionUseCase).execute(result.sessionId.value);

		expect(session.activeAgent.value).toBe("sales");
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
			const opening = await first.app.get(SendMessageUseCase).execute("Meu nome é Gabriel. Guarde isso.");
			await first.app.close();

			const restarted = await booted(file);
			const answer = await restarted.app.get(SendMessageUseCase).execute("Qual é o meu nome?", opening.sessionId.value);

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
describe.runIf(apiKey && gemini)("AI: two models behind the same store", () => {
	const stores: AiStore[] = [];

	afterAll(async () => {
		for (const store of stores) await store.app.close();
	});

	async function answerFrom(model: "openai" | "gemini"): Promise<string> {
		if (apiKey === undefined || gemini === undefined) throw new Error("no api key");
		const store = await bootAi(model === "openai" ? storeModel(apiKey) : geminiModel(gemini));
		stores.push(store);
		return (await store.app.get(SendMessageUseCase).execute(SAME_QUESTION)).text;
	}

	it("says close enough to the same thing on OpenAI and on Gemini", { timeout: 180_000 }, async () => {
		if (gemini === undefined) throw new Error("no api key");

		const answers = [await answerFrom("openai"), await answerFrom("gemini")];

		expect(answers[0]?.length).toBeGreaterThan(0);
		expect(answers[1]?.length).toBeGreaterThan(0);
		expect(await closenessOf(String(answers[0]), String(answers[1]), gemini)).toBeGreaterThan(CLOSE_ENOUGH);
	});
});
