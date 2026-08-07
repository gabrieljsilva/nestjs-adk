import "@nestjs-adk/testing/matchers";
import { AdkAgent, AgentNotBoundError, SessionStorage, SqliteConnection, SqliteSessionStorage } from "@nestjs-adk/core";
import { AdkTestBedBuilder, ScriptedModel } from "@nestjs-adk/testing";
import { Test } from "@nestjs/testing";
import { describe, expect, it } from "vitest";
import { AppModule } from "../../app.module";
import { StoreDatabase } from "../../shared/store-database";
import { ConciergeAgent } from "./concierge.agent";

describe("ConciergeAgent", () => {
	it("is an agent an application can inject as itself", () => {
		expect(new ConciergeAgent()).toBeInstanceOf(AdkAgent);
	});

	it("says it is not wired instead of answering half wired", async () => {
		await expect(new ConciergeAgent().ask("my controller broke")).rejects.toBeInstanceOf(AgentNotBoundError);
	});

	it("names the class in the failure, so the missing provider is findable", async () => {
		await expect(new ConciergeAgent().ask("hello")).rejects.toThrow("ConciergeAgent");
	});

	it("keeps a cacheable prefix across fresh runs", async () => {
		const connection = new SqliteConnection();
		const model = new ScriptedModel("concierge-prefix").strict().mockText("first").mockText("second");
		await using bed = await AdkTestBedBuilder.from(Test.createTestingModule({ imports: [AppModule] }))
			.overriding(StoreDatabase, new StoreDatabase(connection))
			.overriding(SessionStorage, new SqliteSessionStorage(connection))
			.withModel(model)
			.boot();
		const agent = bed.get(ConciergeAgent);

		const [firstContext] = await agent.explain("I want to buy a game.");
		const [secondContext] = await agent.explain("My controller arrived broken.");

		expect(firstContext).toBeDefined();
		expect(secondContext).toBeDefined();
		expect([firstContext, secondContext]).toHaveStablePrefix(0.8);
	});
});
