import "reflect-metadata";
import "@nestjs-adk/testing/matchers";
import { type AdkTestBed, RecordingModel } from "@nestjs-adk/testing";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { InspectSessionUseCase } from "../chat/inspect-session.use-case";
import { aiStore, breathe, judge, mixedStore, storeGate, storeModel } from "./ai-suite.fixture";
import { SalesAgent } from "./sales.agent";

let bed: AdkTestBed;

/**
 * The sector that has to use its tools, against a provider that decides on its own.
 *
 * The catalog answers numbers nobody can guess: three copies of a game priced at 279,90
 * come to 755,73 after the bulk discount, and the model was never told any of that. An
 * answer carrying that number is an answer that went through `search_games` and
 * `quote_game`, which is the only thing worth paying a provider to find out.
 */
describe.runIf(storeGate.present)("AI: sales, tools and the answer they produce", () => {
	beforeEach(breathe);

	afterEach(async () => {
		await bed?.close();
	});

	async function booted(): Promise<AdkTestBed> {
		bed = await aiStore().boot();
		return bed;
	}

	it("quotes from the catalog instead of inventing a price", { timeout: 120_000 }, async () => {
		await booted();

		const run = await bed.agent(SalesAgent).ask("Quanto sai três cópias de Elden Ring Nightreign?");

		expect(run).toHaveRunTool("quote_game");
		expect(run.text).toContain("755");
		expect(run).toHaveStatus("completed");
	});

	it("answers a greeting without reaching for a tool", { timeout: 60_000 }, async () => {
		await booted();

		const run = await bed.agent(SalesAgent).ask("Oi, tudo bem?");

		expect(run.text.length).toBeGreaterThan(0);
		expect(run.toolsRun).toEqual([]);
	});

	/**
	 * One question about three titles is three quotes, and the shelf is why.
	 *
	 * `search_games` answers what exists and never a price, so comparing titles cannot be
	 * done in one call. What this is watching for is whether the model asks for them
	 * together in one turn, which is the case the runtime runs in parallel.
	 */
	it("compares titles by quoting each one, in as few turns as it can", { timeout: 120_000 }, async () => {
		await booted();

		const run = await bed
			.agent(SalesAgent)
			.ask("Compare os preços de Elden Ring Nightreign, Hollow Knight Silksong e Stardew Valley. Uma cópia de cada.");

		expect(run.events.ran("quote_game")).toBeGreaterThanOrEqual(3);
		expect(run.events.largestBatch).toBeGreaterThan(1);
	});

	/**
	 * A rubric, because the wording changes every run.
	 *
	 * `toContain` on a generated sentence either fails on a rewrite or asserts so little
	 * that it passes on anything. The judge grades what the answer had to say and lets the
	 * rest move.
	 */
	it("says what a customer asked for, judged rather than matched", { timeout: 120_000 }, async () => {
		await booted();

		const run = await bed.agent(SalesAgent).ask("Quais jogos de PS5 vocês têm? Cite os títulos.");

		await expect(run.text).toSatisfyRubric(judge(), "lists at least two PlayStation 5 game titles sold by the store");
	});

	it(
		"keeps the conversation, so the next question is answered with the first in view",
		{ timeout: 120_000 },
		async () => {
			await booted();
			const sales = bed.agent(SalesAgent);
			const opening = await sales.ask("Estou de olho em Stardew Valley.");

			const follow = await sales.ask("Quanto custa uma cópia dele?");
			const session = await bed.get(InspectSessionUseCase).execute(opening.sessionId.value);

			expect(follow.sessionId.value).toBe(opening.sessionId.value);
			expect(follow.text).toContain("24");
			expect(session.revision.value).toBeGreaterThan(1);
		},
	);

	/** The arguments are the assertion: a quote for the wrong title is a wrong answer. */
	it("sends the tool the title the customer named", { timeout: 120_000 }, async () => {
		await booted();

		const run = await bed.agent(SalesAgent).ask("Quanto custa uma cópia de Stardew Valley?");

		expect(JSON.stringify(run.callsTo("quote_game").at(0)?.args)).toContain("stardew");
	});

	it("says it does not have a title the shelf never carried", { timeout: 120_000 }, async () => {
		await booted();

		const run = await bed.agent(SalesAgent).ask("Vocês têm Half-Life 3? Responda em uma frase.");

		await expect(run.text).toSatisfyRubric(judge(), "says the store does not have that game");
	});

	/**
	 * The always skill is in every prompt, which is what the tone of an answer comes from.
	 *
	 * A scripted agent keeps its requests, so a fake suite reads them off the script. Behind
	 * a provider there is no script to read, and what the model was actually sent is only
	 * knowable by recording it, which is what this wraps the model to do.
	 */
	it("carries the always skill into the instructions the provider was sent", { timeout: 120_000 }, async () => {
		const recording = new RecordingModel(storeModel());
		bed = await mixedStore()
			.withModel(recording)
			.withModelFor("concierge", recording)
			.withModelFor("sales", recording)
			.withModelFor("warranty", recording)
			.withModelFor("billing", recording)
			.boot();

		await bed.agent(SalesAgent).ask("Oi!");

		expect(recording.calls.at(0)?.request.instructions?.text.length).toBeGreaterThan(0);
	});

	it("starts a new conversation when the test asks for one", { timeout: 120_000 }, async () => {
		await booted();
		const sales = bed.agent(SalesAgent);
		const first = await sales.ask("Estou de olho em Stardew Valley.");

		const fresh = await sales.newSession().ask("Oi, tudo bem?");

		expect(fresh.sessionId.value).not.toBe(first.sessionId.value);
	});
});
