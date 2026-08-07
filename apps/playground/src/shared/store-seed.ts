import { Clock } from "@nestjs-adk/core";
import { Injectable, type OnModuleInit } from "@nestjs/common";
import { Order } from "../aftersales/order";
import { OrderRepository } from "../aftersales/order.repository";
import { Game } from "../catalog/game";
import { GameRepository } from "../catalog/game.repository";

const MILLIS_PER_DAY = 24 * 60 * 60 * 1000;

/** Inside the seven day window, and well outside it: one order for each side of the rule. */
const RECENT_DAYS = 2;
const OLD_DAYS = 40;

/**
 * The shelf.
 *
 * Six titles is enough to search through, to quote from and to compare, and small enough
 * that a test can assert an exact number. The prices are not round on purpose: a total
 * only the catalog knows is what tells an answer that used the tool from an answer the
 * model made up.
 */
const SHELF: readonly Game[] = [
	Game.of("elden-ring-nightreign", "Elden Ring Nightreign", "ps5", "action", 27_990, true),
	Game.of("hollow-knight-silksong", "Hollow Knight Silksong", "switch", "metroidvania", 8_490, true),
	Game.of("gran-turismo-8", "Gran Turismo 8", "ps5", "racing", 34_990, false),
	Game.of("halo-forge", "Halo Forge", "xbox", "tiro", 19_990, true),
	Game.of("stardew-valley", "Stardew Valley", "pc", "simulation", 2_490, true),
	Game.of("ea-fc-27", "EA FC 27", "ps5", "sports", 29_990, false),
];

/**
 * What the store already had when it opened.
 *
 * It runs at boot and writes nothing that is already there, so an application that opens
 * the same database file again keeps the orders and the tickets it accumulated. Delivery
 * dates are relative to the clock rather than fixed, because a refund window measured
 * against a date written in 2026 stops meaning anything in 2027.
 */
@Injectable()
export class StoreSeed implements OnModuleInit {
	public constructor(
		private readonly games: GameRepository,
		private readonly orders: OrderRepository,
		private readonly clock: Clock,
	) {}

	public onModuleInit(): void {
		this.apply();
	}

	public apply(): void {
		for (const game of SHELF) this.games.save(game);
		for (const order of this.purchases()) this.orders.save(order);
	}

	private purchases(): readonly Order[] {
		return [
			Order.of(
				"A-1042",
				"Ana Ribeiro",
				"DualSense Nitro Wireless Controller",
				34_900,
				"gold",
				this.daysAgo(RECENT_DAYS),
				"delivered",
			),
			Order.of("B-2071", "Bruno Lima", "Headset Aurora Pro", 18_900, "silver", this.daysAgo(OLD_DAYS), "delivered"),
		];
	}

	private daysAgo(days: number): string {
		return this.clock
			.now()
			.plusMillis(-days * MILLIS_PER_DAY)
			.toIso();
	}
}
