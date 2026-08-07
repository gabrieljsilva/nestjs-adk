import { Clock, Instant } from "@nestjs-adk/core";
import { Test, type TestingModuleBuilder } from "@nestjs/testing";
import { describe, expect, it } from "vitest";
import { AppModule } from "../../app.module";
import { StoreDatabase } from "../../shared/store-database";
import { StoreSeed } from "../../shared/store-seed";
import { OrderRepository } from "../order.repository";
import { IssueRefundTool } from "./issue-refund.tool";

describe("IssueRefundTool", () => {
	it("refunds in reais and records centavos", async () => {
		const module = await Test.createTestingModule({ imports: [AppModule] })
			.overrideProvider(StoreDatabase)
			.useValue(new StoreDatabase())
			.overrideProvider(Clock)
			.useValue({ now: () => Instant.fromIso("2026-08-05T12:00:00.000Z") })
			.compile();
		module.get(StoreSeed).apply();
		const tool = module.get(IssueRefundTool);
		const orders = module.get(OrderRepository);
		expect(tool.execute({ orderId: "A-1042", amountBrl: 349 })).toEqual({
			refunded: true,
			orderId: "A-1042",
			amountBrl: 349,
		});
		expect(orders.findById("A-1042")?.refundedCents).toBe(34_900);
	});

	it("tells the run why it was refused instead of failing it", async () => {
		const module = await Test.createTestingModule({ imports: [AppModule] })
			.overrideProvider(StoreDatabase)
			.useValue(new StoreDatabase())
			.overrideProvider(Clock)
			.useValue({ now: () => Instant.fromIso("2026-08-05T12:00:00.000Z") })
			.compile();
		module.get(StoreSeed).apply();
		const tool = module.get(IssueRefundTool);
		const answer = tool.execute({ orderId: "B-2071", amountBrl: 189 });

		expect(Reflect.get(Object(answer), "refunded")).toBe(false);
		expect(Reflect.get(Object(answer), "error")).toContain("7 days");
	});

	it("tells the run when the order does not exist", async () => {
		const module = await Test.createTestingModule({ imports: [AppModule] })
			.overrideProvider(StoreDatabase)
			.useValue(new StoreDatabase())
			.overrideProvider(Clock)
			.useValue({ now: () => Instant.fromIso("2026-08-05T12:00:00.000Z") })
			.compile();
		module.get(StoreSeed).apply();
		const tool = module.get(IssueRefundTool);
		expect(Reflect.get(Object(tool.execute({ orderId: "A-9", amountBrl: 10 })), "error")).toContain("A-9");
	});

	it("writes nothing when the policy refuses", async () => {
		const module = await Test.createTestingModule({ imports: [AppModule] })
			.overrideProvider(StoreDatabase)
			.useValue(new StoreDatabase())
			.overrideProvider(Clock)
			.useValue({ now: () => Instant.fromIso("2026-08-05T12:00:00.000Z") })
			.compile();
		module.get(StoreSeed).apply();
		const tool = module.get(IssueRefundTool);
		const orders = module.get(OrderRepository);
		tool.execute({ orderId: "B-2071", amountBrl: 189 });

		expect(orders.findById("B-2071")?.isRefunded).toBe(false);
	});
});
