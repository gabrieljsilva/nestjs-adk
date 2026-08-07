import "@nestjs-adk/testing/matchers";
import { AdkAgent, AgentNotBoundError, SessionStorage, SqliteConnection, SqliteSessionStorage } from "@nestjs-adk/core";
import { AdkTestBedBuilder, ScriptedModel } from "@nestjs-adk/testing";
import { Test } from "@nestjs/testing";
import { describe, expect, it } from "vitest";
import { AppModule } from "../../app.module";
import { StoreDatabase } from "../../shared/store-database";
import { SalesAgent } from "./sales.agent";

describe("SalesAgent", () => {
	it("is an agent an application can inject as itself", () => {
		expect(new SalesAgent()).toBeInstanceOf(AdkAgent);
	});

	it("answers the tone the sector always speaks in", () => {
		expect(new SalesAgent().tone()).toContain("reais");
	});

	it("holds the club rules as text, which is what a skill is", () => {
		expect(new SalesAgent().clubPolicy()).toContain("10%");
	});

	it("says it is not wired instead of answering half wired", async () => {
		await expect(new SalesAgent().ask("how much does it cost")).rejects.toBeInstanceOf(AgentNotBoundError);
	});

	it("keeps a cacheable prefix across fresh runs", async () => {
		const connection = new SqliteConnection();
		const model = new ScriptedModel("sales-prefix").strict().mockText("first").mockText("second");
		await using bed = await AdkTestBedBuilder.from(Test.createTestingModule({ imports: [AppModule] }))
			.overriding(StoreDatabase, new StoreDatabase(connection))
			.overriding(SessionStorage, new SqliteSessionStorage(connection))
			.withModel(model)
			.boot();
		const agent = bed.get(SalesAgent);

		const [firstContext] = await agent.explain("How much is Stardew Valley?");
		const [secondContext] = await agent.explain("Which games are available for PS5?");

		expect(firstContext).toBeDefined();
		expect(secondContext).toBeDefined();
		expect([firstContext, secondContext]).toHaveStablePrefix(0.8);
	});
});
