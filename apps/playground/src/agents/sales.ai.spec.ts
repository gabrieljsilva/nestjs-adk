import "reflect-metadata";
import "@nestjs-adk/testing/matchers";
import { afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { InspectSessionUseCase } from "../chat/inspect-session.use-case";
import { type AiStore, bootAi, breathe, judgeWith, storeKey, storeModel } from "./ai-suite.fixture";
import { SalesAgent } from "./sales.agent";

const apiKey = storeKey();

/**
 * The sector that has to use its tools, against a provider that decides on its own.
 *
 * The catalog answers numbers nobody can guess: three copies of a game priced at 279,90
 * come to 755,73 after the bulk discount, and the model was never told any of that. An
 * answer carrying that number is an answer that went through `search_games` and
 * `quote_game`, which is the only thing worth paying a provider to find out.
 */
describe.runIf(apiKey)("AI: sales, tools and the answer they produce", () => {
	let store: AiStore;

	beforeAll(() => {
		if (apiKey === undefined) throw new Error("no api key");
	});

	beforeEach(breathe);

	afterEach(async () => {
		await store?.app.close();
	});

	async function booted(): Promise<AiStore> {
		if (apiKey === undefined) throw new Error("no api key");
		store = await bootAi(storeModel(apiKey));
		return store;
	}

	it("quotes from the catalog instead of inventing a price", { timeout: 120_000 }, async () => {
		const { app, events } = await booted();

		const result = await app.get(SalesAgent).ask("Quanto sai três cópias de Elden Ring Nightreign?");

		expect(events.toolsRun).toContain("quote_game");
		expect(result.text).toContain("755");
		expect(result.status.name).toBe("completed");
	});

	it("answers a greeting without reaching for a tool", { timeout: 60_000 }, async () => {
		const { app, events } = await booted();

		const result = await app.get(SalesAgent).ask("Oi, tudo bem?");

		expect(result.text.length).toBeGreaterThan(0);
		expect(events.toolsRun).toEqual([]);
	});

	/**
	 * One question about three titles is three quotes, and the shelf is why.
	 *
	 * `search_games` answers what exists and never a price, so comparing titles cannot be
	 * done in one call. What this is watching for is whether the model asks for them
	 * together in one turn, which is the case the runtime runs in parallel.
	 */
	it("compares titles by quoting each one, in as few turns as it can", { timeout: 120_000 }, async () => {
		const { app, events } = await booted();

		await app
			.get(SalesAgent)
			.ask("Compare os preços de Elden Ring Nightreign, Hollow Knight Silksong e Stardew Valley. Uma cópia de cada.");

		expect(events.ran("quote_game")).toBeGreaterThanOrEqual(3);
		expect(events.largestBatch).toBeGreaterThan(1);
	});

	/**
	 * A rubric, because the wording changes every run.
	 *
	 * `toContain` on a generated sentence either fails on a rewrite or asserts so little
	 * that it passes on anything. The judge grades what the answer had to say and lets the
	 * rest move.
	 */
	it("says what a customer asked for, judged rather than matched", { timeout: 120_000 }, async () => {
		if (apiKey === undefined) throw new Error("no api key");
		const { app } = await booted();

		const result = await app.get(SalesAgent).ask("Quais jogos de PS5 vocês têm? Cite os títulos.");

		await expect(result.text).toSatisfyRubric(
			judgeWith(apiKey),
			"lists at least two PlayStation 5 game titles sold by the store",
		);
	});

	it(
		"keeps the conversation, so the next question is answered with the first in view",
		{ timeout: 120_000 },
		async () => {
			const { app } = await booted();
			const opening = await app.get(SalesAgent).ask("Estou de olho em Stardew Valley.");

			const follow = await app.get(SalesAgent).ask("Quanto custa uma cópia dele?", opening.sessionId);
			const session = await app.get(InspectSessionUseCase).execute(opening.sessionId.value);

			expect(follow.sessionId.value).toBe(opening.sessionId.value);
			expect(follow.text).toContain("24");
			expect(session.revision.value).toBeGreaterThan(1);
		},
	);
});
