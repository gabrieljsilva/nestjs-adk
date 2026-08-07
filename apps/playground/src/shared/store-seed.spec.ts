import { Clock, Instant } from "@nestjs-adk/core";
import { describe, expect, it } from "vitest";
import { OrderRepository } from "../aftersales/order.repository";
import { RefundPolicy } from "../aftersales/refund-policy";
import { GameRepository } from "../catalog/game.repository";
import { StoreDatabase } from "./store-database";
import { StoreSeed } from "./store-seed";

class FixedClock extends Clock {
	public constructor(private readonly instant: Instant) {
		super();
	}

	public now(): Instant {
		return this.instant;
	}
}

describe("StoreSeed", () => {
	it("fills the shelf at boot", () => {
		const now = Instant.fromIso("2026-08-05T12:00:00.000Z");
		const database = new StoreDatabase();
		const games = new GameRepository(database);
		const orders = new OrderRepository(database);
		const seed = new StoreSeed(games, orders, new FixedClock(now));

		seed.onModuleInit();

		expect(games.all()).toHaveLength(6);
		expect(games.findBySlug("elden-ring-nightreign")?.priceBrl).toBe(279.9);
	});

	it("sells on more than one platform, and both media", () => {
		const now = Instant.fromIso("2026-08-05T12:00:00.000Z");
		const database = new StoreDatabase();
		const games = new GameRepository(database);
		const orders = new OrderRepository(database);
		const seed = new StoreSeed(games, orders, new FixedClock(now));

		seed.apply();

		expect(games.search("ps5")).toHaveLength(3);
		expect(games.findBySlug("gran-turismo-8")?.isDigital).toBe(false);
	});

	it("dates the orders against the clock, not against a date written down", () => {
		const now = Instant.fromIso("2026-08-05T12:00:00.000Z");
		const database = new StoreDatabase();
		const games = new GameRepository(database);
		const orders = new OrderRepository(database);
		const seed = new StoreSeed(games, orders, new FixedClock(now));

		seed.apply();

		expect(orders.findById("A-1042")?.daysSinceDelivery(now)).toBe(2);
		expect(orders.findById("B-2071")?.daysSinceDelivery(now)).toBe(40);
	});

	it("leaves one order inside the refund window and one outside it", () => {
		const now = Instant.fromIso("2026-08-05T12:00:00.000Z");
		const database = new StoreDatabase();
		const games = new GameRepository(database);
		const orders = new OrderRepository(database);
		const seed = new StoreSeed(games, orders, new FixedClock(now));
		const policy = new RefundPolicy();

		seed.apply();
		const refundable = orders.findById("A-1042");
		const expired = orders.findById("B-2071");
		if (refundable === undefined || expired === undefined) throw new Error("the seed did not write its orders");

		expect(policy.decide(refundable, 34_900, now).allowed).toBe(true);
		expect(policy.decide(expired, 18_900, now).allowed).toBe(false);
	});

	it("writes nothing twice, so opening the same database again keeps what happened", () => {
		const now = Instant.fromIso("2026-08-05T12:00:00.000Z");
		const database = new StoreDatabase();
		const games = new GameRepository(database);
		const orders = new OrderRepository(database);
		const seed = new StoreSeed(games, orders, new FixedClock(now));

		seed.apply();
		const order = orders.findById("A-1042");
		if (order === undefined) throw new Error("the seed did not write order A-1042");
		orders.markRefunded(order, 34_900);
		seed.apply();

		expect(orders.findById("A-1042")?.isRefunded).toBe(true);
		expect(games.all()).toHaveLength(6);
	});
});
