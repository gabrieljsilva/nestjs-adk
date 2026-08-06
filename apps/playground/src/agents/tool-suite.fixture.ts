import { Clock, IdGenerator, Instant } from "@nestjs-adk/core";
import { OrderRepository } from "../aftersales/order.repository";
import { GameRepository } from "../catalog/game.repository";
import { StoreDatabase } from "../shared/store-database";
import { StoreSeed } from "../shared/store-seed";

/** The instant the store was seeded at, which is what the refund window is measured from. */
export const SEEDED_AT = "2026-08-05T12:00:00.000Z";

class SeedClock extends Clock {
	public now(): Instant {
		return Instant.fromIso(SEEDED_AT);
	}
}

class CountingIds extends IdGenerator {
	private issued = 0;

	public next(): string {
		this.issued += 1;
		return String(this.issued);
	}
}

/** A database with the shelf and the two orders in it, on a clock that does not move. */
export function seededStore(): StoreDatabase {
	const database = new StoreDatabase();
	new StoreSeed(new GameRepository(database), new OrderRepository(database), seedClock()).apply();
	return database;
}

export function seedClock(): Clock {
	return new SeedClock();
}

/** Ids a test can predict, which is what makes an assertion about a ticket readable. */
export function countingIds(): IdGenerator {
	return new CountingIds();
}
