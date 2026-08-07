import "reflect-metadata";
import "@nestjs-adk/testing/matchers";
import {
	LiteLLMPricingSource,
	ModelIdentity,
	SessionStorage,
	SqliteConnection,
	SqliteSessionStorage,
} from "@nestjs-adk/core";
import { type AdkTestBed, AdkTestBedBuilder, RecordingModel, RunTranscript } from "@nestjs-adk/testing";
import { Test, type TestingModuleBuilder } from "@nestjs/testing";
import { describe, expect, it } from "vitest";
import { AppModule } from "../../app.module";
import { InspectSessionUseCase } from "../../chat/inspect-session.use-case";
import { StoreDatabase } from "../../shared/store-database";
import { judge, openAILuna } from "../../testing/models";
import { SalesAgent } from "../sales/sales.agent";

/**
 * The sector that has to use its tools, against a provider that decides on its own.
 *
 * The catalog answers numbers nobody can guess: three copies of a game priced at 279,90
 * come to 755,73 after the bulk discount, and the model was never told any of that. An
 * answer carrying that number is an answer that went through `search_games` and
 * `quote_game`, which is the only thing worth paying a provider to find out.
 */
describe("AI: sales, tools and the answer they produce", () => {
	it("quotes from the catalog instead of inventing a price", { timeout: 120_000 }, async () => {
		const connection = new SqliteConnection();
		await using bed = await AdkTestBedBuilder.from(Test.createTestingModule({ imports: [AppModule] }))
			.overriding(StoreDatabase, new StoreDatabase(connection))
			.overriding(SessionStorage, new SqliteSessionStorage(connection))
			.withModel(openAILuna)
			.withConsumers(new RunTranscript())
			.boot();

		const run = await bed.agent(SalesAgent).ask("How much do three copies of Elden Ring Nightreign cost?");

		expect(run).toHaveRunTool("quote_game");
		expect(run.text).toContain("755");
		expect(run).toHaveStatus("completed");
	});

	/**
	 * What a real run cost, priced by the catalog LiteLLM actually publishes today.
	 *
	 * This is the one thing a fake catalog cannot answer: whether the table that exists right
	 * now, at the URL the source reads, still holds the model this application runs on under a
	 * key the resolver finds. `isComplete` is most of the assertion. It goes false if the
	 * download failed, if the payload stopped being a catalog, if upstream renamed
	 * `input_cost_per_token`, or if `gpt-5.6-luna` left the table.
	 *
	 * The amount is deliberately not pinned to a number. The rates are community data that
	 * upstream owns and may change any day, so asserting one would make this red for something
	 * that is not a bug. What is asserted is that a real answer produced a real price, that the
	 * price is exact, and that a run of several turns adds up under the model that served them.
	 */
	it("prices what it just paid for against the published catalog", { timeout: 120_000 }, async () => {
		const connection = new SqliteConnection();
		await using bed = await AdkTestBedBuilder.from(Test.createTestingModule({ imports: [AppModule] }))
			.overriding(StoreDatabase, new StoreDatabase(connection))
			.overriding(SessionStorage, new SqliteSessionStorage(connection))
			.withModel(openAILuna)
			.withConsumers(new RunTranscript())
			.boot();

		const run = await bed.agent(SalesAgent).ask("How much does one copy of Stardew Valley cost?");

		expect(run).toHaveRunTool("quote_game");
		expect(run.cost.isComplete).toBe(true);
		expect(run.cost.unpriced).toEqual([]);
		expect(run.cost.byModel.map((model) => model.model.toString())).toEqual(["openai/gpt-5.6-luna"]);
		expect(run.cost.total.pico).toBeGreaterThan(0n);
		// The precision promise on a real amount: an exact decimal, never `8.8e-6`.
		expect(run.cost.total.toString()).toMatch(/^\d+(\.\d+)?$/);

		// A tool call is two turns at least, and both belong to the same entry.
		const priced = run.cost.byModel[0];
		expect(priced?.calls).toBeGreaterThan(1);
		expect(priced?.usage.inputTokens).toBeGreaterThan(0);
		expect(priced?.usage.outputTokens).toBeGreaterThan(0);
		expect(run.cost.calls).toBe(priced?.calls);
	});

	/**
	 * The reported amount against the rates the catalog published, part by part.
	 *
	 * The identity asserted is the whole of what pricing claims: each part is its own token count
	 * times its own published rate, and the cached share comes out of the input rather than being
	 * added to it. A provider that reports cached tokens is what makes the third part mean
	 * anything, and OpenAI caches automatically only above about a thousand prompt tokens, which
	 * the store's own prompt never reaches. Hence the preamble and the second question in the same
	 * session: the second run replays a prefix the provider has already seen.
	 *
	 * The rates are read from the source rather than written here on purpose. They are community
	 * data upstream owns, so a literal would make this red the day a price changes, which is not a
	 * bug. That the projection reads the right fields, and ignores the `_priority` and `_flex`
	 * tiers next to them, is proved offline against a literal in the projection's own spec.
	 */
	it("bills each part at its published rate and discounts the cached share", { timeout: 180_000 }, async () => {
		const connection = new SqliteConnection();
		await using bed = await AdkTestBedBuilder.from(Test.createTestingModule({ imports: [AppModule] }))
			.overriding(StoreDatabase, new StoreDatabase(connection))
			.overriding(SessionStorage, new SqliteSessionStorage(connection))
			.withModel(openAILuna)
			.withConsumers(new RunTranscript())
			.boot();

		// The bed keeps the conversation, so the second question replays the first as its prefix.
		const preamble = "For context, our procurement policy reads as follows. ".repeat(60);
		const sales = bed.agent(SalesAgent);
		await sales.ask(`${preamble} How much does one copy of Stardew Valley cost?`);
		const run = await sales.ask(`${preamble} And how much for three copies?`);

		const priced = run.cost.byModel[0];
		if (priced === undefined) throw new Error("the run was not priced");
		const price = await new LiteLLMPricingSource().priceOf(ModelIdentity.of("openai", "gpt-5.6-luna"));
		if (price === undefined) throw new Error("the catalog does not know the model");

		const { inputTokens, outputTokens, cachedInputTokens } = priced.usage;
		const fresh = BigInt(inputTokens - cachedInputTokens);
		const cacheRate = price.cacheRead?.picoPerToken ?? price.input.picoPerToken;

		expect(priced.breakdown.input.pico).toBe(fresh * price.input.picoPerToken);
		expect(priced.breakdown.output.pico).toBe(BigInt(outputTokens) * price.output.picoPerToken);
		expect(priced.breakdown.cached.pico).toBe(BigInt(cachedInputTokens) * cacheRate);
		expect(run.cost.total.pico).toBe(
			priced.breakdown.input.pico + priced.breakdown.output.pico + priced.breakdown.cached.pico,
		);

		// A prompt this size is far from the band the catalog declares, so the base rates applied.
		expect(price.ratesFor(inputTokens).input.picoPerToken).toBe(price.input.picoPerToken);

		/**
		 * Whether the cache engaged is the provider's call and not something to fail a run over.
		 * When it did, the discount has to be real: the same tokens billed cold cost more.
		 */
		if (cachedInputTokens > 0) {
			const cold = BigInt(inputTokens) * price.input.picoPerToken + BigInt(outputTokens) * price.output.picoPerToken;
			expect(run.cost.total.pico).toBeLessThan(cold);
		}
	});

	it("answers a greeting without reaching for a tool", { timeout: 60_000 }, async () => {
		const connection = new SqliteConnection();
		await using bed = await AdkTestBedBuilder.from(Test.createTestingModule({ imports: [AppModule] }))
			.overriding(StoreDatabase, new StoreDatabase(connection))
			.overriding(SessionStorage, new SqliteSessionStorage(connection))
			.withModel(openAILuna)
			.withConsumers(new RunTranscript())
			.boot();

		const run = await bed.agent(SalesAgent).ask("Hello, how are you?");

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
		const connection = new SqliteConnection();
		await using bed = await AdkTestBedBuilder.from(Test.createTestingModule({ imports: [AppModule] }))
			.overriding(StoreDatabase, new StoreDatabase(connection))
			.overriding(SessionStorage, new SqliteSessionStorage(connection))
			.withModel(openAILuna)
			.withConsumers(new RunTranscript())
			.boot();

		const run = await bed
			.agent(SalesAgent)
			.ask("Compare the prices of Elden Ring Nightreign, Hollow Knight Silksong, and Stardew Valley. One copy of each.");

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
		const connection = new SqliteConnection();
		await using bed = await AdkTestBedBuilder.from(Test.createTestingModule({ imports: [AppModule] }))
			.overriding(StoreDatabase, new StoreDatabase(connection))
			.overriding(SessionStorage, new SqliteSessionStorage(connection))
			.withModel(openAILuna)
			.withConsumers(new RunTranscript())
			.boot();

		const run = await bed.agent(SalesAgent).ask("Which PS5 games do you have? List the titles.");

		await expect(run.text).toSatisfyRubric(judge, "lists at least two PlayStation 5 game titles sold by the store");
	});

	it(
		"keeps the conversation, so the next question is answered with the first in view",
		{ timeout: 120_000 },
		async () => {
			const connection = new SqliteConnection();
			await using bed = await AdkTestBedBuilder.from(Test.createTestingModule({ imports: [AppModule] }))
				.overriding(StoreDatabase, new StoreDatabase(connection))
				.overriding(SessionStorage, new SqliteSessionStorage(connection))
				.withModel(openAILuna)
				.withConsumers(new RunTranscript())
				.boot();
			const sales = bed.agent(SalesAgent);
			const opening = await sales.ask("I am interested in Stardew Valley.");

			const follow = await sales.ask("How much does one copy cost?");
			const session = await bed.get(InspectSessionUseCase).execute(opening.sessionId.value);

			expect(follow.sessionId.value).toBe(opening.sessionId.value);
			expect(follow.text).toContain("24");
			expect(session.revision.value).toBeGreaterThan(1);
		},
	);

	/** The arguments are the assertion: a quote for the wrong title is a wrong answer. */
	it("sends the tool the title the customer named", { timeout: 120_000 }, async () => {
		const connection = new SqliteConnection();
		await using bed = await AdkTestBedBuilder.from(Test.createTestingModule({ imports: [AppModule] }))
			.overriding(StoreDatabase, new StoreDatabase(connection))
			.overriding(SessionStorage, new SqliteSessionStorage(connection))
			.withModel(openAILuna)
			.withConsumers(new RunTranscript())
			.boot();

		const run = await bed.agent(SalesAgent).ask("How much does one copy of Stardew Valley cost?");

		expect(JSON.stringify(run.callsTo("quote_game").at(0)?.args)).toContain("stardew");
	});

	it("says it does not have a title the shelf never carried", { timeout: 120_000 }, async () => {
		const connection = new SqliteConnection();
		await using bed = await AdkTestBedBuilder.from(Test.createTestingModule({ imports: [AppModule] }))
			.overriding(StoreDatabase, new StoreDatabase(connection))
			.overriding(SessionStorage, new SqliteSessionStorage(connection))
			.withModel(openAILuna)
			.withConsumers(new RunTranscript())
			.boot();

		const run = await bed.agent(SalesAgent).ask("Do you have Half-Life 3? Answer in one sentence.");

		await expect(run.text).toSatisfyRubric(judge, "says the store does not have that game");
	});

	/**
	 * The always skill is in every prompt, which is what the tone of an answer comes from.
	 *
	 * A scripted agent keeps its requests, so a fake suite reads them off the script. Behind
	 * a provider there is no script to read, and what the model was actually sent is only
	 * knowable by recording it, which is what this wraps the model to do.
	 */
	it("carries the always skill into the instructions the provider was sent", { timeout: 120_000 }, async () => {
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

		await bed.agent(SalesAgent).ask("Hello!");

		expect(recording.calls.at(0)?.request.instructions?.text.length).toBeGreaterThan(0);
	});

	it("starts a new conversation when the test asks for one", { timeout: 120_000 }, async () => {
		const connection = new SqliteConnection();
		await using bed = await AdkTestBedBuilder.from(Test.createTestingModule({ imports: [AppModule] }))
			.overriding(StoreDatabase, new StoreDatabase(connection))
			.overriding(SessionStorage, new SqliteSessionStorage(connection))
			.withModel(openAILuna)
			.withConsumers(new RunTranscript())
			.boot();
		const sales = bed.agent(SalesAgent);
		const first = await sales.ask("I am interested in Stardew Valley.");

		const fresh = await sales.newSession().ask("Hello, how are you?");

		expect(fresh.sessionId.value).not.toBe(first.sessionId.value);
	});

	/**
	 * The one thing a fake cannot answer about cancellation.
	 *
	 * A fake proves the runtime ends the run and journals it, which the offline suite does.
	 * What only a real provider proves is the half after that: that the signal reaches the
	 * SDK and the request in flight is actually dropped. Before the signal existed, breaking
	 * out of this loop stopped the reading and nothing else, and the tokens for the rest of
	 * the answer were generated and billed to a customer who had already walked away.
	 *
	 * It is the cheapest case in this file: it abandons the answer after the second chunk.
	 */
	it("stops a real answer in flight when the customer walks away", { timeout: 120_000 }, async () => {
		const connection = new SqliteConnection();
		const controller = new AbortController();
		await using bed = await AdkTestBedBuilder.from(Test.createTestingModule({ imports: [AppModule] }))
			.overriding(StoreDatabase, new StoreDatabase(connection))
			.overriding(SessionStorage, new SqliteSessionStorage(connection))
			.withModel(openAILuna)
			.withConsumers(new RunTranscript())
			.boot();

		const streaming = bed.get(SalesAgent).stream("List every PS5 game you sell, one sentence about each.", {
			signal: controller.signal,
		});
		const read = async () => {
			let chunks = 0;
			for await (const _chunk of streaming) {
				chunks += 1;
				if (chunks === 2) controller.abort();
			}
		};

		await expect(read()).rejects.toThrow();
		expect(bed.events.countOf("run.cancelled")).toBe(1);
		expect(bed.events.countOf("run.completed")).toBe(0);
	});
});
