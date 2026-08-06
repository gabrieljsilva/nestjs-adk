import { InvalidQuantityError } from "./errors/invalid-quantity.error";
import type { Game } from "./game";

const CENTS_PER_REAL = 100;

/** Published in the store's terms: three copies or more leave with a tenth off. */
const BULK_FROM = 3;
const BULK_DISCOUNT = 0.1;

/**
 * What a customer would pay for a number of copies of one title.
 *
 * The volume rule lives here rather than in the service because it is what makes a quote
 * a quote: without it, a total is a multiplication anybody could do, and the number the
 * store answers would be one the customer could have guessed.
 */
export class Quote {
	private constructor(
		public readonly slug: string,
		public readonly title: string,
		public readonly quantity: number,
		public readonly unitPriceCents: number,
		public readonly totalCents: number,
		public readonly discountCents: number,
	) {}

	public static of(game: Game, quantity: number): Quote {
		if (!Number.isSafeInteger(quantity) || quantity < 1) throw new InvalidQuantityError(quantity);
		const subtotal = game.totalCentsFor(quantity);
		const discount = quantity >= BULK_FROM ? Math.round(subtotal * BULK_DISCOUNT) : 0;
		return new Quote(game.slug, game.title, quantity, game.priceCents, subtotal - discount, discount);
	}

	public get totalBrl(): number {
		return this.totalCents / CENTS_PER_REAL;
	}

	public get unitPriceBrl(): number {
		return this.unitPriceCents / CENTS_PER_REAL;
	}

	public get discountBrl(): number {
		return this.discountCents / CENTS_PER_REAL;
	}

	public get hasDiscount(): boolean {
		return this.discountCents > 0;
	}
}
