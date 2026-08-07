import "@nestjs-adk/testing/matchers";
import { AdkAgent, Clock, Instant, SessionStorage, SqliteConnection, SqliteSessionStorage } from "@nestjs-adk/core";
import { AdkTestBedBuilder, ScriptedModel } from "@nestjs-adk/testing";
import { Test } from "@nestjs/testing";
import { describe, expect, it } from "vitest";
import { AppModule } from "../../app.module";
import { StoreDatabase } from "../../shared/store-database";
import { StoreSeed } from "../../shared/store-seed";
import { BillingAgent } from "../billing/billing.agent";

describe("BillingAgent", () => {
	it("is an agent an application can inject as itself", async () => {
		const module = await Test.createTestingModule({ imports: [AppModule] })
			.overrideProvider(StoreDatabase)
			.useValue(new StoreDatabase())
			.overrideProvider(Clock)
			.useValue({ now: () => Instant.fromIso("2026-08-05T12:00:00.000Z") })
			.compile();
		module.get(StoreSeed).apply();
		const agent = module.get(BillingAgent);
		expect(agent).toBeInstanceOf(AdkAgent);
	});

	it("shows the order, in the reais a conversation speaks in", async () => {
		const module = await Test.createTestingModule({ imports: [AppModule] })
			.overrideProvider(StoreDatabase)
			.useValue(new StoreDatabase())
			.overrideProvider(Clock)
			.useValue({ now: () => Instant.fromIso("2026-08-05T12:00:00.000Z") })
			.compile();
		module.get(StoreSeed).apply();
		const agent = module.get(BillingAgent);
		expect(agent.findOrder({ orderId: "A-1042" })).toEqual({
			orderId: "A-1042",
			customer: "Ana Ribeiro",
			product: "DualSense Nitro Wireless Controller",
			totalBrl: 349,
			plan: "gold",
			status: "delivered",
			daysSinceDelivery: 2,
		});
	});

	it("tells the run the order does not exist instead of failing it", async () => {
		const module = await Test.createTestingModule({ imports: [AppModule] })
			.overrideProvider(StoreDatabase)
			.useValue(new StoreDatabase())
			.overrideProvider(Clock)
			.useValue({ now: () => Instant.fromIso("2026-08-05T12:00:00.000Z") })
			.compile();
		module.get(StoreSeed).apply();
		const agent = module.get(BillingAgent);
		expect(Reflect.get(Object(agent.findOrder({ orderId: "A-9" })), "error")).toContain("A-9");
	});

	it("answers the ceiling of a plan in reais", async () => {
		const module = await Test.createTestingModule({ imports: [AppModule] })
			.overrideProvider(StoreDatabase)
			.useValue(new StoreDatabase())
			.overrideProvider(Clock)
			.useValue({ now: () => Instant.fromIso("2026-08-05T12:00:00.000Z") })
			.compile();
		module.get(StoreSeed).apply();
		const agent = module.get(BillingAgent);
		expect(agent.refundLimit({ plan: "gold" })).toEqual({ plan: "gold", limitBrl: 1437 });
		expect(agent.refundLimit({ plan: "silver" })).toEqual({ plan: "silver", limitBrl: 475 });
	});

	it("answers the smallest ceiling for a plan nobody sells", async () => {
		const module = await Test.createTestingModule({ imports: [AppModule] })
			.overrideProvider(StoreDatabase)
			.useValue(new StoreDatabase())
			.overrideProvider(Clock)
			.useValue({ now: () => Instant.fromIso("2026-08-05T12:00:00.000Z") })
			.compile();
		module.get(StoreSeed).apply();
		const agent = module.get(BillingAgent);
		expect(Reflect.get(Object(agent.refundLimit({ plan: "platinum" })), "limitBrl")).toBe(99);
	});

	it("keeps a cacheable prefix across fresh runs", async () => {
		const connection = new SqliteConnection();
		const model = new ScriptedModel("billing-prefix").strict().mockText("first").mockText("second");
		await using bed = await AdkTestBedBuilder.from(Test.createTestingModule({ imports: [AppModule] }))
			.overriding(StoreDatabase, new StoreDatabase(connection))
			.overriding(SessionStorage, new SqliteSessionStorage(connection))
			.withModel(model)
			.boot();
		const agent = bed.get(BillingAgent);

		const [firstContext] = await agent.explain("What is the status of order A-1042?");
		const [secondContext] = await agent.explain("What is the refund limit for the gold plan?");

		expect(firstContext).toBeDefined();
		expect(secondContext).toBeDefined();
		expect([firstContext, secondContext]).toHaveStablePrefix(0.8);
	});
});
