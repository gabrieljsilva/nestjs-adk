import { describe, expect, it } from "vitest";
import { InvalidQuantityError } from "./errors/invalid-quantity.error";
import { Game } from "./game";
import { Quote } from "./quote";

const nightreign = Game.of("elden-ring-nightreign", "Elden Ring Nightreign", "ps5", "acao", 27_990, true);

describe("Quote", () => {
	it("quotes one copy at the shelf price", () => {
		const quote = Quote.of(nightreign, 1);

		expect(quote.title).toBe("Elden Ring Nightreign");
		expect(quote.quantity).toBe(1);
		expect(quote.totalBrl).toBe(279.9);
		expect(quote.hasDiscount).toBe(false);
	});

	it("multiplies without a discount below three copies", () => {
		expect(Quote.of(nightreign, 2).totalBrl).toBe(559.8);
	});

	it("takes a tenth off from three copies up", () => {
		const quote = Quote.of(nightreign, 3);

		expect(quote.discountBrl).toBe(83.97);
		expect(quote.totalBrl).toBe(755.73);
		expect(quote.hasDiscount).toBe(true);
	});

	it("keeps the shelf price visible next to the total", () => {
		expect(Quote.of(nightreign, 3).unitPriceBrl).toBe(279.9);
	});

	it("refuses a number of copies nobody can buy", () => {
		expect(() => Quote.of(nightreign, 0)).toThrow(InvalidQuantityError);
		expect(() => Quote.of(nightreign, -1)).toThrow(InvalidQuantityError);
		expect(() => Quote.of(nightreign, 1.5)).toThrow(InvalidQuantityError);
	});
});
