import { Clock, Instant } from "@nestjs-adk/core";
import { beforeEach, describe, expect, it } from "vitest";
import type { Order } from "../aftersales/order";
import { OrderRepository } from "../aftersales/order.repository";
import { RefundPolicy } from "../aftersales/refund-policy";
import { GameRepository } from "../catalog/game.repository";
import { StoreDatabase } from "./store-database";
import { StoreSeed } from "./store-seed";

const NOW = Instant.fromIso("2026-08-05T12:00:00.000Z");

class FixedClock extends Clock {
	public now(): Instant {
		return NOW;
	}
}

let games: GameRepository;
let orders: OrderRepository;
let seed: StoreSeed;

function seeded(id: string): Order {
	const order = orders.findById(id);
	if (order === undefined) throw new Error(`the seed did not write order ${id}`);
	return order;
}

beforeEach(() => {
	const database = new StoreDatabase();
	games = new GameRepository(database);
	orders = new OrderRepository(database);
	seed = new StoreSeed(games, orders, new FixedClock());
});

describe("StoreSeed", () => {
	it("fills the shelf at boot", () => {
		seed.onModuleInit();

		expect(games.all()).toHaveLength(6);
		expect(games.findBySlug("elden-ring-nightreign")?.priceBrl).toBe(279.9);
	});

	it("sells on more than one platform, and both media", () => {
		seed.apply();

		expect(games.search("ps5")).toHaveLength(3);
		expect(games.findBySlug("gran-turismo-8")?.isDigital).toBe(false);
	});

	it("dates the orders against the clock, not against a date written down", () => {
		seed.apply();

		expect(seeded("A-1042").daysSinceDelivery(NOW)).toBe(2);
		expect(seeded("B-2071").daysSinceDelivery(NOW)).toBe(40);
	});

	it("leaves one order inside the refund window and one outside it", () => {
		seed.apply();
		const policy = new RefundPolicy();

		expect(policy.decide(seeded("A-1042"), 34_900, NOW).allowed).toBe(true);
		expect(policy.decide(seeded("B-2071"), 18_900, NOW).allowed).toBe(false);
	});

	it("writes nothing twice, so opening the same database again keeps what happened", () => {
		seed.apply();
		orders.markRefunded(seeded("A-1042"), 34_900);

		seed.apply();

		expect(seeded("A-1042").isRefunded).toBe(true);
		expect(games.all()).toHaveLength(6);
	});
});
